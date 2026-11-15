using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.CopperFoxHome.Configuration;

public class CustomHomeRowDefinition
{
    public string Title { get; set; } = string.Empty;
    public string RowType { get; set; } = "Collection";
    public string TargetValue { get; set; } = string.Empty;
    public string Scope { get; set; } = "OwnedOnly";
    public string SortBy { get; set; } = "SortName";
    public string SortOrder { get; set; } = "Ascending";
    public int Limit { get; set; } = 25;
}

public class PluginConfiguration : BasePluginConfiguration
{
    public string DiscoverLibraryId { get; set; } = string.Empty;

    public List<CustomHomeRowDefinition> Rows { get; set; } = new()
    {
        new CustomHomeRowDefinition
        {
            Title = "Top Genre For You",
            RowType = "TopGenre",
            Scope = "OwnedOnly",
            SortBy = "Random",
            Limit = 20
        },
        new CustomHomeRowDefinition
        {
            Title = "Harry Potter Collection",
            RowType = "Collection",
            TargetValue = "4ca22b93013a86aca66741235b7cbd37",
            Scope = "OwnedOnly",
            SortBy = "PremiereDate,SortName",
            SortOrder = "Ascending",
            Limit = 25
        }
    };
}
