using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.CopperFoxHome.Configuration;

public class CustomHomeRowDefinition
{
    public string Title { get; set; } = string.Empty;

    public string RowType { get; set; } = "Collection";

    public string TargetValue { get; set; } = string.Empty;

    public string ExcludeTags { get; set; } = string.Empty;

    public bool GroupIntoCollections { get; set; } = false;

    public string Scope { get; set; } = "OwnedOnly";

    public string SortBy { get; set; } = "SortName";

    public string SortOrder { get; set; } = "Ascending";

    public int Limit { get; set; } = 25;
}


public class PluginConfiguration : BasePluginConfiguration
{
    public string DiscoverLibraryId { get; set; } = string.Empty;

    public List<CustomHomeRowDefinition> Rows { get; set; } = new List<CustomHomeRowDefinition>();
}
