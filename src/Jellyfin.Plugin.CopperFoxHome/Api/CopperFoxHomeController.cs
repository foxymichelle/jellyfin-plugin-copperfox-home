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

        var usedGenres = new HashSet<string>(
            config.Rows
                .Where(r => string.Equals(r.RowType, "Genre", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.TargetValue))
                .Select(r => r.TargetValue.Trim()),
            StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < config.Rows.Count; i++)
        {
            var rowDef = config.Rows[i];
            var items = ResolveRowItems(rowDef, user, discoverLibGuid, usedGenres, out var dynamicTitle);
            var isClientFetched =
                string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(rowDef.RowType, "MyMedia", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(rowDef.RowType, "ContinueAndUpNext", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(rowDef.RowType, "LatestMovies", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(rowDef.RowType, "LatestShows", StringComparison.OrdinalIgnoreCase);
            if (items.Count == 0 && !isClientFetched)
            {
                continue;
            }

            var dtos = items.Select(item =>
            {
                var kind = item.GetBaseItemKind().ToString();
                int? childCount = item is Folder folder ? folder.GetChildren(user, false).Count : null;
                int? episodeCount = item is MediaBrowser.Controller.Entities.TV.Series series
                    ? series.GetEpisodes(user, new DtoOptions(false), false).Count
                    : null;
                return new
                {
                    Id = item.Id.ToString("N"),
                    Name = item.Name,
                    Type = kind,
                    Overview = item.Overview,
                    Genres = item.Genres ?? Array.Empty<string>(),
                    PrimaryImageAspectRatio = 0.6666667,
                    IsDiscover = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase),
                    ChildCount = childCount,
                    RecursiveItemCount = episodeCount
                };
            }).ToList();


            resultRows.Add(new
            {
                key = $"cfRow_{i}_{rowDef.RowType}",
                title = string.IsNullOrWhiteSpace(dynamicTitle) ? rowDef.Title : dynamicTitle,
                rowType = rowDef.RowType,
                targetValue = rowDef.TargetValue,
                scope = rowDef.Scope,
                imageStyle = string.IsNullOrWhiteSpace(rowDef.ImageStyle) ? "Poster" : rowDef.ImageStyle,
                items = dtos
            });
        }

        return Ok(new
        {
            discoverLibraryId = config.DiscoverLibraryId ?? string.Empty,
            myMediaOrder = config.MyMediaLibraryOrder ?? new List<string>(),
            excludedMyMediaIds = config.ExcludedMyMediaIds ?? new List<string>(),
            rows = resultRows
        });
    }

    private List<BaseItem> ResolveRowItems(
        CustomHomeRowDefinition rowDef,
        Jellyfin.Database.Implementations.Entities.User user,
        Guid discoverLibGuid,
        HashSet<string> usedGenres,
        out string dynamicTitle)
    {
        dynamicTitle = rowDef.Title;
        var limit = rowDef.Limit > 0 ? rowDef.Limit : 12;

        if (string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rowDef.RowType, "MyMedia", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rowDef.RowType, "ContinueAndUpNext", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rowDef.RowType, "LatestMovies", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rowDef.RowType, "LatestShows", StringComparison.OrdinalIgnoreCase))
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
                Limit = 250
            };
            return ApplyPostFilters(_libraryManager.GetItemList(genreQuery), rowDef, user, discoverLibGuid, shuffle: true, limit);
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
            var isDiscover = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title)
                ? (isDiscover ? $"DISCOVER More of {chosenGenre}" : $"More of {chosenGenre}")
                : rowDef.Title.Replace("{Genre}", chosenGenre);

            var recQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Genres = new[] { chosenGenre },
                Limit = 250
            };
            return ApplyPostFilters(_libraryManager.GetItemList(recQuery), rowDef, user, discoverLibGuid, shuffle: true, limit);
        }

        if (string.Equals(rowDef.RowType, "BecauseYouWatched", StringComparison.OrdinalIgnoreCase))
        {
            var historyQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Episode },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 20
            };

            var candidates = ApplyScopeFilter(_libraryManager.GetItemList(historyQuery), "OwnedOnly", discoverLibGuid).ToList();

            if (candidates.Count == 0)
            {
                var resumableQuery = new InternalItemsQuery(user)
                {
                    Recursive = true,
                    IsResumable = true,
                    IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Episode },
                    OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                    Limit = 20
                };
                candidates = ApplyScopeFilter(_libraryManager.GetItemList(resumableQuery), "OwnedOnly", discoverLibGuid).ToList();
            }

            var recent = candidates
                .Select(x => x is MediaBrowser.Controller.Entities.TV.Episode ep ? (BaseItem?)ep.Series : x)
                .FirstOrDefault(x => x != null && x.Genres != null && x.Genres.Length > 0);

            if (recent == null)
            {
                return new List<BaseItem>();
            }

            var isDiscoverByw = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title)
                ? (isDiscoverByw ? $"DISCOVER More Like {recent.Name}" : $"Because You Watched {recent.Name}")
                : rowDef.Title;
            var seedGenres = new HashSet<string>(recent.Genres, StringComparer.OrdinalIgnoreCase);
            var seedTags = new HashSet<string>(recent.Tags ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);

            var poolQuery = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { recent.GetBaseItemKind() },
                Genres = recent.Genres,
                Limit = 250
            };

            var ranked = ApplyScopeFilter(_libraryManager.GetItemList(poolQuery), rowDef.Scope, discoverLibGuid)
                .Where(x => x.Id != recent.Id)
                .Select(x =>
                {
                    var genreOverlap = (x.Genres ?? Array.Empty<string>()).Count(g => seedGenres.Contains(g));
                    var tagOverlap = (x.Tags ?? Array.Empty<string>()).Count(t => seedTags.Contains(t));
                    return new { Item = x, Score = (tagOverlap * 3) + genreOverlap };
                })
                .Where(x => x.Score >= 1)
                .OrderByDescending(x => x.Score)
                .ThenBy(_ => Random.Shared.Next())
                .Select(x => x.Item)
                .ToList();

            return ApplyPostFilters(ranked, rowDef, user, discoverLibGuid, shuffle: false, limit);
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
                Limit = 250
            };
            return ApplyPostFilters(_libraryManager.GetItemList(tagQuery), rowDef, user, discoverLibGuid, shuffle: true, limit);
        }

        return new List<BaseItem>();
    }

    private List<BaseItem> ApplyPostFilters(
        IEnumerable<BaseItem> source,
        CustomHomeRowDefinition rowDef,
        Jellyfin.Database.Implementations.Entities.User user,
        Guid discoverLibGuid,
        bool shuffle,
        int limit)
    {
        var filtered = ApplyScopeFilter(source, rowDef.Scope, discoverLibGuid);

        if (!string.IsNullOrWhiteSpace(rowDef.ExcludeTags))
        {
            var excluded = new HashSet<string>(
                rowDef.ExcludeTags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                StringComparer.OrdinalIgnoreCase);

            if (excluded.Count > 0)
            {
                filtered = filtered.Where(item =>
                    item.Tags == null || !item.Tags.Any(t => excluded.Contains(t)));
            }
        }

        var list = filtered.ToList();

        if (rowDef.GroupIntoCollections)
        {
            var boxSets = _libraryManager.GetItemList(new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.BoxSet }
            }).OfType<MediaBrowser.Controller.Entities.Movies.BoxSet>().ToList();

            var movieIdToBoxSet = new Dictionary<Guid, BaseItem>();

            foreach (var boxSet in boxSets)
            {
                foreach (var child in boxSet.GetLinkedChildren())
                {
                    if (child.Id != Guid.Empty && !movieIdToBoxSet.ContainsKey(child.Id))
                    {
                        movieIdToBoxSet[child.Id] = boxSet;
                    }
                }
            }

            var seenIds = new HashSet<Guid>();
            var grouped = new List<BaseItem>();

            foreach (var item in list)
            {
                var displayItem = movieIdToBoxSet.TryGetValue(item.Id, out var parentBoxSet) ? parentBoxSet : item;
                if (seenIds.Add(displayItem.Id))
                {
                    grouped.Add(displayItem);
                }
            }
            list = grouped;
        }

        if (shuffle)
        {
            list = list.OrderBy(_ => Random.Shared.Next()).ToList();
        }

        return list.Take(limit).ToList();
    }

    private IEnumerable<BaseItem> ApplyScopeFilter(IEnumerable<BaseItem> items, string scope, Guid discoverLibGuid)
    {
        if (discoverLibGuid == Guid.Empty)
        {
            return string.Equals(scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase)
                ? Enumerable.Empty<BaseItem>()
                : items;
        }

        var discoverItem = _libraryManager.GetItemById(discoverLibGuid);
        var discoverName = discoverItem?.Name ?? string.Empty;
        var discoverIdStr = discoverLibGuid.ToString("N");

        var virtualFolder = _libraryManager.GetVirtualFolders()
            .FirstOrDefault(vf =>
                string.Equals(vf.ItemId, discoverIdStr, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(vf.ItemId, discoverLibGuid.ToString(), StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrEmpty(discoverName) && string.Equals(vf.Name, discoverName, StringComparison.OrdinalIgnoreCase)));

        var folderPrefixes = (virtualFolder?.Locations ?? Array.Empty<string>())
            .Where(loc => !string.IsNullOrWhiteSpace(loc))
            .Select(loc => loc.TrimEnd('/', '\\').Replace('\\', '/') + "/")
            .ToList();

        bool IsInDiscover(BaseItem item)
        {
            if (item.ParentId == discoverLibGuid || item.GetAncestorIds().Contains(discoverLibGuid))
            {
                return true;
            }

            if (folderPrefixes.Count > 0 && !string.IsNullOrWhiteSpace(item.Path))
            {
                var normalizedItemPath = item.Path.Replace('\\', '/');
                return folderPrefixes.Any(prefix =>
                    normalizedItemPath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            }

            return false;
        }

        if (string.Equals(scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase))
        {
            return items.Where(IsInDiscover);
        }

        return items.Where(i => !IsInDiscover(i));
    }


    private Guid GetCurrentUserId()
    {
        var claim = User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }
}
