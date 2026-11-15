using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.CopperFoxHome.Configuration;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.CopperFoxHome.Api;

[ApiController]
[Authorize]
[Route("CopperFoxHome")]
[Produces(MediaTypeNames.Application.Json)]
public class CopperFoxHomeController : ControllerBase
{
        private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;

    public CopperFoxHomeController(
        ILibraryManager libraryManager,
        IUserManager userManager)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
    }


    [HttpGet("Rows")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<object> GetRows([FromQuery] Guid? userId)
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        var resolvedUserId = userId ?? GetCurrentUserId();
        var user = resolvedUserId != Guid.Empty ? _userManager.GetUserById(resolvedUserId) : null;
        if (user == null)
        {
            return Unauthorized();
        }

        Guid.TryParse(config.DiscoverLibraryId, out var discoverLibGuid);
        var resultRows = new List<object>();

        // Pre-populate any explicitly assigned Genre rows so TopGenre1/2/3 never duplicate them
        var usedGenres = new HashSet<string>(
            config.Rows
                .Where(r => string.Equals(r.RowType, "Genre", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.TargetValue))
                .Select(r => r.TargetValue.Trim()),
            StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < config.Rows.Count; i++)
        {
            var rowDef = config.Rows[i];
            var items = ResolveRowItems(rowDef, user, discoverLibGuid, usedGenres, out var dynamicTitle);
            if (items.Count == 0 && !string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var dtos = items.Select(item => new
            {
                Id = item.Id.ToString("N"),
                Name = item.Name,
                Type = item.GetBaseItemKind().ToString(),
                Overview = item.Overview,
                Genres = item.Genres ?? Array.Empty<string>(),
                PrimaryImageAspectRatio = 0.6666667
            }).ToList();

            resultRows.Add(new
            {
                key = $"cfRow_{i}_{rowDef.RowType}",
                title = string.IsNullOrWhiteSpace(dynamicTitle) ? rowDef.Title : dynamicTitle,
                rowType = rowDef.RowType,
                targetValue = rowDef.TargetValue,
                scope = rowDef.Scope,
                items = dtos
            });
        }

        return Ok(new { rows = resultRows });
    }

    private List<BaseItem> ResolveRowItems(
        CustomHomeRowDefinition rowDef,
        Jellyfin.Database.Implementations.Entities.User user,
        Guid discoverLibGuid,
        HashSet<string> usedGenres,
        out string dynamicTitle)
    {
        dynamicTitle = rowDef.Title;
        var limit = rowDef.Limit > 0 ? rowDef.Limit : 25;

        if (string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase))
        {
            return new List<BaseItem>();
        }

        if (string.Equals(rowDef.RowType, "Genre", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(rowDef.TargetValue))
        {
            var genreName = rowDef.TargetValue.Trim();
            usedGenres.Add(genreName);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title) ? genreName : rowDef.Title;

            var genreQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Genres = new[] { genreName },
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = limit * 2
            };
            return ApplyScopeFilter(_libraryManager.GetItemList(genreQuery), rowDef.Scope, discoverLibGuid)
                .Take(limit)
                .ToList();
        }

        if (rowDef.RowType.StartsWith("TopGenre", StringComparison.OrdinalIgnoreCase))
        {
            var historyQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 60
            };
            var played = ApplyScopeFilter(_libraryManager.GetItemList(historyQuery), "OwnedOnly", discoverLibGuid);
            var rankedGenres = played
                .SelectMany(x => x.Genres ?? Array.Empty<string>())
                .Where(g => !string.IsNullOrWhiteSpace(g))
                .GroupBy(g => g, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .Select(g => g.Key)
                .ToList();

            var chosenGenre = rankedGenres.FirstOrDefault(g => !usedGenres.Contains(g));
            if (string.IsNullOrEmpty(chosenGenre))
            {
                return new List<BaseItem>();
            }

            usedGenres.Add(chosenGenre);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title)
                ? $"Top {chosenGenre} Picks For You"
                : rowDef.Title.Replace("{Genre}", chosenGenre);

            var recQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Genres = new[] { chosenGenre },
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = limit * 2
            };
            return ApplyScopeFilter(_libraryManager.GetItemList(recQuery), rowDef.Scope, discoverLibGuid)
                .Take(limit)
                .ToList();
        }

        if (string.Equals(rowDef.RowType, "BecauseYouWatched", StringComparison.OrdinalIgnoreCase))
        {
            var lastWatchedQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 10
            };
            var seed = ApplyScopeFilter(_libraryManager.GetItemList(lastWatchedQuery), "OwnedOnly", discoverLibGuid)
                .FirstOrDefault();
            if (seed == null || seed.Genres == null || seed.Genres.Length == 0)
            {
                return new List<BaseItem>();
            }

            dynamicTitle = $"Because You Watched {seed.Name}";
            var seedGenres = new HashSet<string>(seed.Genres, StringComparer.OrdinalIgnoreCase);
            var seedTags = new HashSet<string>(seed.Tags ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);

            var poolQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { seed.GetBaseItemKind() },
                Genres = seed.Genres,
                Limit = 150
            };

            return ApplyScopeFilter(_libraryManager.GetItemList(poolQuery), rowDef.Scope, discoverLibGuid)
                .Where(x => x.Id != seed.Id)
                .Select(x =>
                {
                    var genreOverlap = (x.Genres ?? Array.Empty<string>()).Count(g => seedGenres.Contains(g));
                    var tagOverlap = (x.Tags ?? Array.Empty<string>()).Count(t => seedTags.Contains(t));
                    return new { Item = x, Score = (tagOverlap * 3) + genreOverlap };
                })
                .Where(x => x.Score >= Math.Min(2, seedGenres.Count))
                .OrderByDescending(x => x.Score)
                .ThenBy(_ => Random.Shared.Next())
                .Select(x => x.Item)
                .Take(limit)
                .ToList();
        }

        if ((string.Equals(rowDef.RowType, "Tag", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(rowDef.RowType, "Keyword", StringComparison.OrdinalIgnoreCase)) &&
            !string.IsNullOrWhiteSpace(rowDef.TargetValue))
        {
            var tagList = rowDef.TargetValue
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            if (tagList.Length == 0)
            {
                return new List<BaseItem>();
            }

            var tagQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Tags = tagList,
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = limit * 2
            };
            return ApplyScopeFilter(_libraryManager.GetItemList(tagQuery), rowDef.Scope, discoverLibGuid)
                .Take(limit)
                .ToList();
        }

        return new List<BaseItem>();
    }

    private static IEnumerable<BaseItem> ApplyScopeFilter(IEnumerable<BaseItem> items, string scope, Guid discoverLibGuid)
    {
        if (discoverLibGuid == Guid.Empty)
        {
            return items;
        }

        if (string.Equals(scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase))
        {
            return items.Where(i => i.GetAncestorIds().Contains(discoverLibGuid));
        }

        return items.Where(i => !i.GetAncestorIds().Contains(discoverLibGuid));
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }
}
