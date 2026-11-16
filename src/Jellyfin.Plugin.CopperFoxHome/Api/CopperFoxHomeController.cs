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
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.CopperFoxHome.Api;

[ApiController]
[Authorize]
[Route("CopperFoxHome")]
[Produces(MediaTypeNames.Application.Json)]
public class CopperFoxHomeController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IUserViewManager _userViewManager;

    public CopperFoxHomeController(
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager,
        IUserViewManager userViewManager)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
        _userViewManager = userViewManager;
    }


    [HttpGet("Rows")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<object> GetRows([FromQuery] Guid? userId, [FromQuery] int? rowIndex, [FromQuery] int skip = 0)
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
            if (rowIndex.HasValue && rowIndex.Value != i)
            {
                if (rowDef.RowType.StartsWith("TopGenre", StringComparison.OrdinalIgnoreCase))
                {
                    ResolveRowItems(rowDef, user, discoverLibGuid, usedGenres, 0, out _, out _);
                }
                continue;
            }

            var allItems = ResolveRowItems(rowDef, user, discoverLibGuid, usedGenres, skip, out var dynamicTitle, out var hasMore);
                        if (allItems.Count == 0 && skip == 0)
            {
                continue;
            }

            var dtos = allItems.Select(item =>
            {
                var kind = item.GetBaseItemKind().ToString();
                int? childCount = item is MediaBrowser.Controller.Entities.Movies.BoxSet boxSet
                    ? boxSet.GetLinkedChildren().Count
                    : (item is Folder folder ? folder.GetChildren(user, false).Count : null);
                int? episodeCount = item is MediaBrowser.Controller.Entities.TV.Series series
                    ? series.GetEpisodes(user, new DtoOptions(false), false).Count()
                    : null;
                var backdropCount = item.GetImages(MediaBrowser.Model.Entities.ImageType.Backdrop).Count();
                var hasThumb = item.HasImage(MediaBrowser.Model.Entities.ImageType.Thumb);
                var userData = _userDataManager.GetUserData(user, item);

                string? seriesId = null;
                string? seriesName = null;
                int? seasonNum = null;
                int? episodeNum = null;
                string? parentThumbId = null;

                if (item is MediaBrowser.Controller.Entities.TV.Episode ep)
                {
                    seriesId = ep.SeriesId != Guid.Empty ? ep.SeriesId.ToString("N") : null;
                    seriesName = ep.SeriesName;
                    seasonNum = ep.ParentIndexNumber;
                    episodeNum = ep.IndexNumber;
                    if (ep.Series != null)
                    {
                        childCount = _libraryManager.GetItemList(new InternalItemsQuery(user)
                        {
                            Parent = ep.Series,
                            IncludeItemTypes = new[] { BaseItemKind.Season }
                        }).Count;
                        episodeCount = ep.Series.GetEpisodes(user, new DtoOptions(false), false).Count();
                        if (ep.Series.HasImage(MediaBrowser.Model.Entities.ImageType.Thumb))
                        {
                            parentThumbId = ep.SeriesId.ToString("N");
                        }
                    }
                }

                return new
                {
                    Id = item.Id.ToString("N"),
                    Name = item.Name,
                    Type = kind,
                    CollectionType = (item as ICollectionFolder)?.CollectionType?.ToString(),
                    SeriesId = seriesId,
                    SeriesName = seriesName,
                    ParentIndexNumber = seasonNum,
                    IndexNumber = episodeNum,
                    ParentThumbItemId = parentThumbId,
                    Overview = item.Overview,
                    Genres = item.Genres ?? Array.Empty<string>(),
                    PrimaryImageAspectRatio = 0.6666667,
                    RunTimeTicks = item.RunTimeTicks,
                    ImageTags = hasThumb ? new { Thumb = "1" } : null,
                    BackdropImageTags = Enumerable.Range(0, backdropCount).Select(idx => idx.ToString()).ToArray(),
                    UserData = new
                    {
                        Played = userData?.Played ?? false,
                        IsFavorite = userData?.IsFavorite ?? false,
                        PlaybackPositionTicks = userData?.PlaybackPositionTicks ?? 0L
                    },
                    IsDiscover = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase),
                    ChildCount = childCount,
                    RecursiveItemCount = episodeCount
                };
            }).ToList();

            resultRows.Add(new
            {
                rowIndex = i,
                key = $"cfRow_{i}_{rowDef.RowType}",
                title = string.IsNullOrWhiteSpace(dynamicTitle) ? rowDef.Title : dynamicTitle,
                rowType = rowDef.RowType,
                targetValue = rowDef.TargetValue,
                scope = rowDef.Scope,
                imageStyle = string.IsNullOrWhiteSpace(rowDef.ImageStyle) ? "Poster" : rowDef.ImageStyle,
                hasMore = hasMore,
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
        int skip,
        out string dynamicTitle,
        out bool hasMore)
    {
        dynamicTitle = rowDef.Title;
        hasMore = false;
        int pageSize = string.Equals(rowDef.ImageStyle, "Thumb", StringComparison.OrdinalIgnoreCase) ? 14 : 20;

        if (string.Equals(rowDef.RowType, "Collection", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(rowDef.TargetValue, out var colGuid))
        {
            var colItem = _libraryManager.GetItemById(colGuid);
            if (colItem is MediaBrowser.Controller.Entities.Movies.BoxSet boxSet)
            {
                var linked = boxSet.GetLinkedChildren();
                hasMore = linked.Count > (skip + pageSize);
                return linked.Skip(skip).Take(pageSize).ToList();
            }
            if (colItem is Folder folderCol)
            {
                var children = folderCol.GetChildren(user, true);
                hasMore = children.Count > (skip + pageSize);
                return children.Skip(skip).Take(pageSize).ToList();
            }
            return new List<BaseItem>();
        }

        if (string.Equals(rowDef.RowType, "MyMedia", StringComparison.OrdinalIgnoreCase))
        {
            if (skip > 0) return new List<BaseItem>();
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title) ? "My Media" : rowDef.Title;
            var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            var excluded = new HashSet<string>(config.ExcludedMyMediaIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
            var order = config.MyMediaLibraryOrder ?? new List<string>();

            var views = _userViewManager.GetUserViews(new MediaBrowser.Controller.Entities.UserViewQuery { UserId = user.Id })
                .Where(v => !excluded.Contains(v.Id.ToString("N")) && !excluded.Contains(v.Id.ToString()))
                .ToList();

            var ordered = new List<BaseItem>();
            foreach (var idStr in order)
            {
                if (Guid.TryParse(idStr, out var g))
                {
                    var match = views.FirstOrDefault(v => v.Id == g);
                    if (match != null) ordered.Add(match);
                }
            }
            foreach (var v in views)
            {
                if (!ordered.Any(o => o.Id == v.Id)) ordered.Add(v);
            }
            return ordered;
        }

        if (string.Equals(rowDef.RowType, "ContinueAndUpNext", StringComparison.OrdinalIgnoreCase))
        {
            if (skip > 0) return new List<BaseItem>();
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title) ? "Continue Watching" : rowDef.Title;

            var resumeItems = _libraryManager.GetItemList(new InternalItemsQuery(user)
            {
                Recursive = true,
                IsResumable = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Episode },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 30
            });

            var nextUpItems = _libraryManager.GetItemList(new InternalItemsQuery(user)
            {
                Recursive = true,
                IsPlayed = false,
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 30
            }).Where(x => x is MediaBrowser.Controller.Entities.TV.Episode ep && ep.Series != null && ep.Series.IsPlayed(user, null) == false);

            var allCandidates = resumeItems.Concat(nextUpItems).ToList();
            var latestBySeries = new Dictionary<Guid, MediaBrowser.Controller.Entities.TV.Episode>();

            foreach (var item in allCandidates.OfType<MediaBrowser.Controller.Entities.TV.Episode>())
            {
                if (item.SeriesId == Guid.Empty) continue;
                if (!latestBySeries.TryGetValue(item.SeriesId, out var existing))
                {
                    latestBySeries[item.SeriesId] = item;
                }
                else
                {
                    var curScore = ((item.ParentIndexNumber ?? 0) * 10000) + (item.IndexNumber ?? 0);
                    var exScore = ((existing.ParentIndexNumber ?? 0) * 10000) + (existing.IndexNumber ?? 0);
                    if (curScore > exScore) latestBySeries[item.SeriesId] = item;
                }
            }

            var combined = new List<BaseItem>();
            var seen = new HashSet<Guid>();
            foreach (var item in allCandidates)
            {
                BaseItem chosen = item is MediaBrowser.Controller.Entities.TV.Episode ep && ep.SeriesId != Guid.Empty && latestBySeries.TryGetValue(ep.SeriesId, out var best)
                    ? best
                    : item;
                if (seen.Add(chosen.Id))
                {
                    combined.Add(chosen);
                }
            }
            return combined.Take(20).ToList();
        }

        if (string.Equals(rowDef.RowType, "LatestMovies", StringComparison.OrdinalIgnoreCase))
        {
            var isDiscover = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title)
                ? (isDiscover ? "DISCOVER Latest Movies" : "Latest Movies")
                : rowDef.Title;

            var query = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.Movie },
                OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending), (ItemSortBy.SortName, SortOrder.Ascending) },
                Limit = 100
            };
            var filtered = ApplyScopeFilter(_libraryManager.GetItemList(query), rowDef.Scope, discoverLibGuid).ToList();
            hasMore = filtered.Count > (skip + pageSize);
            return filtered.Skip(skip).Take(pageSize).ToList();
        }

        if (string.Equals(rowDef.RowType, "LatestShows", StringComparison.OrdinalIgnoreCase))
        {
            var isDiscover = string.Equals(rowDef.Scope, "DiscoverOnly", StringComparison.OrdinalIgnoreCase);
            dynamicTitle = string.IsNullOrWhiteSpace(rowDef.Title)
                ? (isDiscover ? "DISCOVER Latest Shows" : "Latest Shows")
                : rowDef.Title;

            var query = new InternalItemsQuery(user)
            {
                Recursive = true,
                IncludeItemTypes = new[] { BaseItemKind.Series },
                OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending), (ItemSortBy.SortName, SortOrder.Ascending) },
                Limit = 100
            };
            var filtered = ApplyScopeFilter(_libraryManager.GetItemList(query), rowDef.Scope, discoverLibGuid).ToList();
            hasMore = filtered.Count > (skip + pageSize);
            return filtered.Skip(skip).Take(pageSize).ToList();
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
            return ApplyPostFilters(_libraryManager.GetItemList(genreQuery), rowDef, user, discoverLibGuid, shuffle: true, skip, pageSize, out hasMore);
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
            return ApplyPostFilters(_libraryManager.GetItemList(recQuery), rowDef, user, discoverLibGuid, shuffle: true, skip, pageSize, out hasMore);
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

            return ApplyPostFilters(ranked, rowDef, user, discoverLibGuid, shuffle: false, skip, pageSize, out hasMore);
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
            return ApplyPostFilters(_libraryManager.GetItemList(tagQuery), rowDef, user, discoverLibGuid, shuffle: true, skip, pageSize, out hasMore);
        }

        return new List<BaseItem>();
    }

    private List<BaseItem> ApplyPostFilters(
        IEnumerable<BaseItem> source,
        CustomHomeRowDefinition rowDef,
        Jellyfin.Database.Implementations.Entities.User user,
        Guid discoverLibGuid,
        bool shuffle,
        int skip,
        int pageSize,
        out bool hasMore)
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
            var seed = (rowDef.Title ?? string.Empty).GetHashCode() ^ DateTime.UtcNow.DayOfYear;
            var rng = new Random(seed);
            list = list.OrderBy(_ => rng.Next()).ToList();
        }

        hasMore = list.Count > (skip + pageSize);
        return list.Skip(skip).Take(pageSize).ToList();
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
