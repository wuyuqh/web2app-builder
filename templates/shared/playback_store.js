(function(global){
  if (global.__W2APlaybackStoreFactory__) return;

  global.__W2APlaybackStoreFactory__ = function(env){
    env = env || {};
    var doc = env.document || document;
    var loc = env.location || location;
    var storage = env.storage || localStorage;
    var getVideo = typeof env.getVideo === 'function' ? env.getVideo : function(){ return doc.querySelector('video'); };
    var getEpisodeLabel = typeof env.getEpisodeLabel === 'function' ? env.getEpisodeLabel : function(){ return String(doc.title || '').trim().slice(0, 160); };
    var getSeriesTitle = typeof env.getSeriesTitle === 'function' ? env.getSeriesTitle : function(){
      var node = doc.querySelector('.videoOsdParentTitle,.pageTitle,h1');
      return String(node && node.textContent || doc.title || '');
    };
    var defaultAdvancedSettings = typeof env.defaultAdvancedSettings === 'function'
      ? env.defaultAdvancedSettings
      : function(){ return {}; };
    var progressStorageKey = env.progressStorageKey || '__w2a_progress';
    var skipStorageKey = env.skipStorageKey || '__w2a_skip_times';
    var advancedStorageKey = env.advancedStorageKey || '__w2a_cinema_adv';

    function stableHash(raw){
      var text = String(raw || '');
      var hash = 0;
      for (var i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      return Math.abs(hash);
    }

    function parseQueryParamsText(raw){
      var out = {};
      String(raw || '').split('&').forEach(function(part){
        if (!part) return;
        var segs = part.split('=');
        var key = decodeURIComponent(String(segs.shift() || '')).trim().toLowerCase();
        if (!key) return;
        out[key] = decodeURIComponent(String(segs.join('=') || '')).trim();
      });
      return out;
    }

    function normalizeSeriesText(raw){
      return String(raw || '')
        .replace(/[|]+/g, ' ')
        .replace(/[\s\u00A0]+/g, ' ')
        .replace(/第\s*\d+\s*[季部篇]/gi, ' ')
        .replace(/第\s*\d+\s*[集话期回]/gi, ' ')
        .replace(/[Ss]\d+[Ee]\d+/g, ' ')
        .replace(/season\s*\d+/gi, ' ')
        .replace(/episode\s*\d+/gi, ' ')
        .replace(/[-_:：]+\s*$/g, ' ')
        .trim()
        .toLowerCase();
    }

    function readJson(key){
      try { return JSON.parse(storage.getItem(key) || '{}'); } catch (e) { return {}; }
    }

    function writeJson(key, value){
      try { storage.setItem(key, JSON.stringify(value || {})); } catch (e) {}
    }

    function currentSeriesKey(){
      try {
        var rawHref = String(loc.href || '');
        var href = rawHref.split('#')[0] || rawHref;
        var url = new URL(href, loc.origin || undefined);
        var params = parseQueryParamsText(url.search ? url.search.slice(1) : '');
        var host = String(url.host || '');
        var path = String(url.pathname || '');
        var douban = String(params.douban_id || params.doubanid || '').trim();
        if (/^\d+$/.test(douban)) return 'series_douban_' + douban;
        var movieMatch = path.match(/\/movie\/(\d+)\/?$/i);
        if (movieMatch && movieMatch[1]) return 'series_douban_' + movieMatch[1];
        var vodId = String(params.vodid || params.vod_id || '').trim();
        if (vodId) {
          var decodedVodId = decodeURIComponent(vodId).trim();
          if (/^tmdb:/i.test(decodedVodId)) return 'series_tmdb_' + stableHash(decodedVodId.toLowerCase());
          return 'series_vod_' + stableHash(decodedVodId.toLowerCase());
        }
        var tmdbId = String(params.tmdb || params.tmdb_id || '').trim();
        if (tmdbId) return 'series_tmdb_' + stableHash(tmdbId.toLowerCase());
        var keep = ['id', 'vid', 'movieid', 'tid', 'pid', 'sid', 'cid', 'playid', 'epid', 'itemid', 'vodid', 'vod_id', 'douban_id'];
        var keepPairs = [];
        keep.forEach(function(key){
          var val = params[key];
          if (val != null && String(val).trim() !== '') keepPairs.push(key + '=' + String(val).trim());
        });
        if (keepPairs.length) return 'series_route_' + stableHash(String(url.protocol || '') + '//' + host + path + '?' + keepPairs.join('&'));
        var seriesText = normalizeSeriesText(getSeriesTitle());
        if (seriesText) return 'series_title_' + stableHash((loc.origin || '') + '||' + seriesText);
        var pathText = path.replace(/\/[^/]*$/, '').trim();
        return 'series_path_' + stableHash((loc.origin || '') + '||' + pathText);
      } catch (e) {
        return 'series_fallback_' + stableHash((loc.origin || '') + '||' + normalizeSeriesText(doc.title || loc.pathname || loc.href || ''));
      }
    }

    function currentEpisodeKey(){
      var v = getVideo();
      var raw = [
        loc.origin || '',
        loc.pathname || loc.href || '',
        getEpisodeLabel(),
        v ? (v.currentSrc || v.src || '') : ''
      ].join('||');
      return 'ep_' + stableHash(raw);
    }

    function currentProgressKey(){
      var raw = [
        loc.origin || '',
        loc.pathname || loc.href || '',
        loc.hash || '',
        getEpisodeLabel()
      ].join('||');
      return 'progress_' + stableHash(raw);
    }

    function loadProgressStore(){
      return readJson(progressStorageKey);
    }

    function saveProgressStore(store){
      writeJson(progressStorageKey, store || {});
    }

    function loadSkipStore(){
      return readJson(skipStorageKey);
    }

    function saveSkipStore(store){
      writeJson(skipStorageKey, store || {});
    }

    function loadAdvancedSettings(){
      var defaults = Object.assign({}, defaultAdvancedSettings() || {});
      var rootStore = readJson(advancedStorageKey);
      var globalStore = rootStore.global && typeof rootStore.global === 'object' ? rootStore.global : rootStore;
      var seriesStore = rootStore.series && typeof rootStore.series === 'object' ? rootStore.series[currentSeriesKey()] : null;
      return Object.assign({}, defaults, globalStore || {}, seriesStore || {});
    }

    function saveAdvancedSettings(settings){
      var defaults = Object.assign({}, defaultAdvancedSettings() || {});
      var rootStore = readJson(advancedStorageKey);
      if (!rootStore || typeof rootStore !== 'object') rootStore = {};
      if (!rootStore.series || typeof rootStore.series !== 'object') rootStore.series = {};
      var merged = Object.assign({}, defaults, settings || {});
      // H8: 仅写入当前剧集字段，不覆盖 global 配置，避免全局配置被当前剧集污染
      rootStore.series[currentSeriesKey()] = merged;
      writeJson(advancedStorageKey, rootStore);
      return rootStore;
    }

    function getSkipInfo(skipStore){
      skipStore = skipStore || {};
      var epKey = currentEpisodeKey();
      var seriesKey = currentSeriesKey();
      return skipStore[epKey] || skipStore[seriesKey] || {};
    }

    function saveSkipField(skipStore, name, value){
      skipStore = skipStore || {};
      var epKey = currentEpisodeKey();
      var seriesKey = currentSeriesKey();
      if (!skipStore[epKey]) skipStore[epKey] = {};
      if (!skipStore[seriesKey]) skipStore[seriesKey] = {};
      skipStore[epKey][name] = value;
      skipStore[seriesKey][name] = value;
      return skipStore;
    }

    function clearSkipField(skipStore, name){
      skipStore = skipStore || {};
      [currentEpisodeKey(), currentSeriesKey()].forEach(function(key){
        if (!skipStore[key]) return;
        delete skipStore[key][name];
        if (!Object.keys(skipStore[key]).length) delete skipStore[key];
      });
      return skipStore;
    }

    return {
      stableHash: stableHash,
      parseQueryParamsText: parseQueryParamsText,
      normalizeSeriesText: normalizeSeriesText,
      currentSeriesKey: currentSeriesKey,
      currentEpisodeKey: currentEpisodeKey,
      currentProgressKey: currentProgressKey,
      loadProgressStore: loadProgressStore,
      saveProgressStore: saveProgressStore,
      loadSkipStore: loadSkipStore,
      saveSkipStore: saveSkipStore,
      loadAdvancedSettings: loadAdvancedSettings,
      saveAdvancedSettings: saveAdvancedSettings,
      getSkipInfo: getSkipInfo,
      saveSkipField: saveSkipField,
      clearSkipField: clearSkipField
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
