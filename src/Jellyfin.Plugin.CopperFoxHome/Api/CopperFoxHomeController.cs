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

        for (int i = 0; i < config.Rows.Count; i++)
        {
            var rowDef = config.Rows[i];
            var items = ResolveRowItems(rowDef, user, discoverLibGuid, out var dynamicTitle);
            if (items.Count == 0)
            {
                continue;
            }

            var dtoOptions = new DtoOptions
            {
                Fields = new[] { ItemFields.PrimaryImageAspectRatio, ItemFields.Overview, ItemFields.Genres }
            };

            var dtos = items.Select(item => new
            {
                Id = item.Id.ToString("N"),
                Name = item.Name,
                Type = item.GetBaseItemKind().ToString(),
                Overview = item.Overview,
                Genres = item.Genres ?? Array.Empty<string>(),
                PrimaryImageAspectRatio = 0.6666667
            }).ToList();
        }

        return Ok(new { rows = resultRows });
    }

    private List<BaseItem> ResolveRowItems(
        CustomHomeRowDefinition rowDef,
        Jellyfin.Database.Implementations.Entities.User user,
        Guid discoverLibGuid,
        out string dynamicTitle)
    {
        dynamicTitle = rowDef.Title;
        var limit = rowDef.Limit > 0 ? rowDef.Limit : 25;

        if (string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase))
        {
            if (!Guid.TryParse(rowDef.TargetValue, out var parentId))
            {
                return new List<BaseItem>();
            }

            var item = _libraryManager.GetItemById(parentId);
            if (item is MediaBrowser.Controller.Entities.Movies.BoxSet boxSet)
            {
                var linked = boxSet.GetLinkedChildren();
                return ApplyScopeFilter(linked, rowDef.Scope, discoverLibGuid)
                    .Take(limit)
                    .ToList();
            }

            if (item is Folder folder)
            {
                var children = folder.GetChildren(user, true);
                return ApplyScopeFilter(children, rowDef.Scope, discoverLibGuid)
                    .Take(limit)
                    .ToList();
            }

            return new List<BaseItem>();
        }

        if (string.Equals(rowDef.RowType, "TopGenre", StringComparison.OrdinalIgnoreCase))
        {
            var historyQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 40
            };
            var played = ApplyScopeFilter(_libraryManager.GetItemList(historyQuery), "OwnedOnly", discoverLibGuid);
            var topGenre = played
                .SelectMany(x => x.Genres ?? Array.Empty<string>())
                .Where(g => !string.IsNullOrWhiteSpace(g))
                .GroupBy(g => g, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .Select(g => g.Key)
                .FirstOrDefault();

            if (string.IsNullOrEmpty(topGenre))
            {
                return new List<BaseItem>();
            }

            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title) || rowDef.Title == "Top Genre For You"
                ? $"Top {topGenre} Picks For You"
                : rowDef.Title.Replace("{Genre}", topGenre);

            var recQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Genres = new[] { topGenre },
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
            var similarQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { seed.GetBaseItemKind() },
                Genres = seed.Genres,
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = limit * 2
            };
            return ApplyScopeFilter(_libraryManager.GetItemList(similarQuery), rowDef.Scope, discoverLibGuid)
                .Where(x => x.Id != seed.Id)
                .Take(limit)
                .ToList();
        }

        if (string.Equals(rowDef.RowType, "Keyword", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(rowDef.TargetValue))
        {
            var kwQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                SearchTerm = rowDef.TargetValue,
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = limit * 2
            };
            return ApplyScopeFilter(_libraryManager.GetItemList(kwQuery), rowDef.Scope, discoverLibGuid)
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
