(function (w) {
  'use strict';

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeSpace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeToken(text) {
    return normalizeSpace(text).toLowerCase();
  }

  function parseList(text) {
    if (!text) return [];
    return String(text)
      .replace(/\r/g, '\n')
      .split(/[\n,;]+/)
      .map(function (item) {
        return normalizeSpace(item);
      })
      .filter(Boolean);
  }

  function parseMappings(text) {
    if (!text) return [];
    var lines = String(text).replace(/\r/g, '\n').split(/[\n,;]+/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var parts;
      if (line.indexOf('=>') !== -1) {
        parts = line.split('=>');
      } else if (line.indexOf('->') !== -1) {
        parts = line.split('->');
      } else if (line.indexOf('=') !== -1) {
        parts = line.split('=');
      } else {
        continue;
      }

      if (parts.length < 2) continue;
      var from = normalizeSpace(parts[0]);
      var to = normalizeSpace(parts.slice(1).join('=>'));
      if (!from || !to) continue;
      out.push({ from: from, to: to });
    }
    return out;
  }

  function decodeBase64Url(input) {
    try {
      var b64 = input.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) {
        b64 += '=';
      }
      if (typeof atob !== 'function') return '';
      return atob(b64);
    } catch (e) {
      return '';
    }
  }

  function decodeRulesParam(raw) {
    if (!raw) return null;
    var attempts = [];
    attempts.push(raw);
    try {
      attempts.push(decodeURIComponent(raw));
    } catch (e) {
      // ignore
    }
    var decodedB64 = decodeBase64Url(raw);
    if (decodedB64) attempts.push(decodedB64);

    for (var i = 0; i < attempts.length; i++) {
      try {
        var parsed = JSON.parse(attempts[i]);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {
        // try next decode format
      }
    }
    return null;
  }

  function preserveCase(source, target) {
    if (!source || !target) return target;
    if (source === source.toUpperCase()) {
      return target.toUpperCase();
    }
    if (source === source.toLowerCase()) {
      return target;
    }
    if (source.charAt(0) === source.charAt(0).toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
      return target.charAt(0).toUpperCase() + target.slice(1);
    }
    return target;
  }

  function maskWord(word) {
    if (!word) return word;
    if (word.length <= 2) {
      return '*'.repeat(word.length);
    }
    return word.charAt(0) + '*'.repeat(word.length - 2) + word.charAt(word.length - 1);
  }

  function maskPhrase(text) {
    return String(text).replace(/[A-Za-z0-9]+/g, function (word) {
      return maskWord(word);
    });
  }

  function soundex(word) {
    var upper = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!upper) return '';

    var map = {
      B: '1', F: '1', P: '1', V: '1',
      C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
      D: '3', T: '3',
      L: '4',
      M: '5', N: '5',
      R: '6'
    };

    var out = upper.charAt(0);
    var last = map[out] || '';

    for (var i = 1; i < upper.length && out.length < 4; i++) {
      var c = upper.charAt(i);
      var code = map[c] || '0';
      if (code !== '0' && code !== last) {
        out += code;
      }
      last = code;
    }

    while (out.length < 4) {
      out += '0';
    }
    return out;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    var v0 = new Array(b.length + 1);
    var v1 = new Array(b.length + 1);

    for (var i = 0; i <= b.length; i++) {
      v0[i] = i;
    }

    for (var ai = 0; ai < a.length; ai++) {
      v1[0] = ai + 1;
      for (var bi = 0; bi < b.length; bi++) {
        var cost = a.charAt(ai) === b.charAt(bi) ? 0 : 1;
        v1[bi + 1] = Math.min(
          v1[bi] + 1,
          v0[bi + 1] + 1,
          v0[bi] + cost
        );
      }
      for (var j = 0; j <= b.length; j++) {
        v0[j] = v1[j];
      }
    }
    return v1[b.length];
  }

  function parseRulesFromUrlParams(urlParams) {
    var cfg = {
      replacements: [],
      restricted: [],
      matchMode: 'phonetic'
    };

    if (!urlParams || typeof urlParams.get !== 'function') {
      return cfg;
    }

    var rulesRaw = urlParams.get('rules');
    var decodedRules = decodeRulesParam(rulesRaw);
    if (decodedRules) {
      cfg.replacements = cfg.replacements.concat(
        toArray(decodedRules.replacements).map(function (item) {
          if (!item || typeof item !== 'object') return null;
          var from = normalizeSpace(item.from);
          var to = normalizeSpace(item.to);
          if (!from || !to) return null;
          return { from: from, to: to };
        }).filter(Boolean)
      );
      cfg.restricted = cfg.restricted.concat(parseList(toArray(decodedRules.restricted).join('\n')));
      if (decodedRules.matchMode) {
        cfg.matchMode = String(decodedRules.matchMode).toLowerCase();
      }
    }

    var mappingParamNames = ['map', 'maps', 'mapping', 'replace', 'replacements'];
    for (var i = 0; i < mappingParamNames.length; i++) {
      var mapRaw = urlParams.get(mappingParamNames[i]);
      if (mapRaw) {
        cfg.replacements = cfg.replacements.concat(parseMappings(mapRaw));
      }
    }

    var restrictedParamNames = ['restricted', 'block', 'blocked', 'ban', 'banned'];
    for (var r = 0; r < restrictedParamNames.length; r++) {
      var listRaw = urlParams.get(restrictedParamNames[r]);
      if (listRaw) {
        cfg.restricted = cfg.restricted.concat(parseList(listRaw));
      }
    }

    var explicitMatch = urlParams.get('match') || urlParams.get('matchmode');
    if (explicitMatch) {
      cfg.matchMode = String(explicitMatch).toLowerCase();
    }

    if (cfg.matchMode !== 'phonetic' && cfg.matchMode !== 'word' && cfg.matchMode !== 'substring') {
      cfg.matchMode = 'phonetic';
    }

    // Deduplicate replacements by normalized "from"
    var seenFrom = Object.create(null);
    cfg.replacements = cfg.replacements.filter(function (entry) {
      if (!entry || !entry.from || !entry.to) return false;
      var key = normalizeToken(entry.from);
      if (!key) return false;
      if (seenFrom[key]) return false;
      seenFrom[key] = true;
      return true;
    });

    // Deduplicate restricted words
    var seenRestricted = Object.create(null);
    cfg.restricted = cfg.restricted.filter(function (term) {
      var key = normalizeToken(term);
      if (!key) return false;
      if (seenRestricted[key]) return false;
      seenRestricted[key] = true;
      return true;
    });

    return cfg;
  }

  function createEngine(config) {
    config = config || {};

    var replacements = toArray(config.replacements).filter(function (entry) {
      return entry && entry.from && entry.to;
    }).map(function (entry) {
      return {
        from: normalizeSpace(entry.from),
        to: normalizeSpace(entry.to),
        fromNorm: normalizeToken(entry.from)
      };
    }).filter(function (entry) {
      return entry.from && entry.to;
    });

    replacements.sort(function (a, b) {
      return b.from.length - a.from.length;
    });

    var replacementLookup = Object.create(null);
    replacements.forEach(function (entry) {
      replacementLookup[entry.fromNorm] = entry.to;
    });

    var fuzzyCandidates = replacements
      .filter(function (entry) {
        return entry.from.indexOf(' ') === -1 && entry.fromNorm.length >= 3;
      })
      .map(function (entry) {
        return {
          from: entry.from,
          fromNorm: entry.fromNorm,
          to: entry.to,
          sound: soundex(entry.fromNorm),
          first: entry.fromNorm.charAt(0)
        };
      });

    var restricted = toArray(config.restricted)
      .map(function (term) {
        return normalizeSpace(term);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.length - a.length;
      });

    var mode = (config.matchMode || 'phonetic').toLowerCase();
    if (mode !== 'phonetic' && mode !== 'word' && mode !== 'substring') {
      mode = 'phonetic';
    }

    function applyExactMappings(text) {
      var out = text;

      for (var i = 0; i < replacements.length; i++) {
        var entry = replacements[i];
        if (!entry.from) continue;
        var escaped = escapeRegex(entry.from);
        var regex;

        if (mode === 'substring') {
          regex = new RegExp(escaped, 'gi');
        } else {
          regex = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', 'gi');
        }

        out = out.replace(regex, function (match, prefix, value) {
          if (mode === 'substring') {
            return preserveCase(match, entry.to);
          }
          var safePrefix = prefix || '';
          return safePrefix + preserveCase(value, entry.to);
        });
      }

      return out;
    }

    function applyFuzzyMappings(text) {
      if (mode !== 'phonetic' || !fuzzyCandidates.length) {
        return text;
      }

      return text.replace(/\b([A-Za-z][A-Za-z0-9'_-]*)\b/g, function (matchWord) {
        var normalized = normalizeToken(matchWord);
        if (!normalized || normalized.length < 3) {
          return matchWord;
        }

        if (replacementLookup[normalized]) {
          // Exact map exists; preserve exact mapping precedence.
          return matchWord;
        }

        var targetSound = soundex(normalized);
        var best = null;

        for (var i = 0; i < fuzzyCandidates.length; i++) {
          var candidate = fuzzyCandidates[i];
          if (candidate.first !== normalized.charAt(0)) {
            continue;
          }

          var dist = levenshtein(normalized, candidate.fromNorm);
          var threshold = normalized.length <= 5 ? 1 : 2;
          var soundMatch = candidate.sound && targetSound && candidate.sound === targetSound;

          if (!soundMatch && dist > threshold) {
            continue;
          }

          var score = dist + (soundMatch ? 0 : 2);
          if (!best || score < best.score) {
            best = { to: candidate.to, score: score };
          }
        }

        if (!best) {
          return matchWord;
        }

        return preserveCase(matchWord, best.to);
      });
    }

    function applyRestrictedMasking(text) {
      var out = text;
      for (var i = 0; i < restricted.length; i++) {
        var phrase = restricted[i];
        if (!phrase) continue;

        var escaped = escapeRegex(phrase);
        var regex = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', 'gi');
        out = out.replace(regex, function (match, prefix, value) {
          var safePrefix = prefix || '';
          return safePrefix + maskPhrase(value);
        });
      }
      return out;
    }

    function apply(text) {
      if (text === null || text === undefined) {
        return text;
      }
      var out = String(text);
      if (!out) return out;

      out = applyExactMappings(out);
      out = applyFuzzyMappings(out);
      out = applyRestrictedMasking(out);
      return out;
    }

    function applyPayload(payload) {
      if (!payload || typeof payload !== 'object') {
        return payload;
      }
      var out = payload;
      if (typeof out.final === 'string') {
        out.final = apply(out.final);
      }
      if (typeof out.interm === 'string') {
        out.interm = apply(out.interm);
      }
      return out;
    }

    return {
      apply: apply,
      applyPayload: applyPayload,
      hasRules: function () {
        return replacements.length > 0 || restricted.length > 0;
      },
      summary: function () {
        return {
          matchMode: mode,
          replacements: replacements.length,
          restricted: restricted.length
        };
      }
    };
  }

  w.CaptionTextRules = {
    parseRulesFromUrlParams: parseRulesFromUrlParams,
    createEngine: createEngine,
    decodeRulesParam: decodeRulesParam,
    parseMappings: parseMappings,
    parseList: parseList
  };
})(window);
