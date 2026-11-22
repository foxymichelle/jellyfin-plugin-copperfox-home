using System;
using System.Collections.Generic;
using Jellyfin.Plugin.CopperFoxHome.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.CopperFoxHome;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "CopperFox Home";

    public override Guid Id => Guid.Parse("c099e7f0-4a1b-4c8d-9e2a-7f1b3c5d8e9a");

    public override string Description => "Personalized content rows for Desktop and Roku (Starfin -> CopperfoxTV).";

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html",
                EnableInMainMenu = true
            },
            new PluginPageInfo
            {
                Name = "copperfoxhomejs",
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.js"
            }
        };
    }
}
