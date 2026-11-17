using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.CopperFoxHome.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string DiscoverLibraryId { get; set; } = string.Empty;

    public List<string> MyMediaLibraryOrder { get; set; } = new List<string>();

    public List<string> ExcludedMyMediaIds { get; set; } = new List<string>();

    public HeroSliderConfig HeroSlider { get; set; } = new HeroSliderConfig();

    public HeroSliderConfig DiscoverSlider { get; set; } = new HeroSliderConfig { Title = "DISCOVER Featured" };

    public List<CustomHomeRowDefinition> Rows { get; set; } = new List<CustomHomeRowDefinition>();
}

public class HeroSliderConfig
{
    public bool Enabled { get; set; } = true;
    public string Title { get; set; } = "Featured";
    public string IncludeTags { get; set; } = string.Empty;
    public string ExcludeTags { get; set; } = string.Empty;
}

public class CustomHomeRowDefinition
{
    public string Title { get; set; } = string.Empty;

    public string RowType { get; set; } = "Collection";

    public string TargetValue { get; set; } = string.Empty;

    public string ExcludeTags { get; set; } = string.Empty;

    public bool GroupIntoCollections { get; set; } = false;

    public string ImageStyle { get; set; } = "Poster";

    public string Scope { get; set; } = "OwnedOnly";

    public string SortBy { get; set; } = "SortName";

    public string SortOrder { get; set; } = "Ascending";

    public int Limit { get; set; } = 12;
}

