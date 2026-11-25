(() => {
  let rules = [];
  let rulesReady = false;
  let halfSpaceSettingsReady = false;
  let preferredWordsReady = false;
  let preferredWordsEnabled = true;
  let preferredWords = new Map();
  let preferredWordMaxLength = 0;
  let preferredWordSource = [];
  let preferredWordOverrides = {};
  let preferredWordDisabled = new Set();
  let preferredSettingsReady = false;
  const halfSpaceSettings = { mi: true, ha: true, suffix: true, bi: true, comparative: true, ham: true, indefiniteYa: true };
  const halfSpaceExceptions = new Set(["تنها", "رها", "بها", "آها", "مها"]);
  const biPrefixWords = ["تردید", "توجّه", "توجه", "حاصل", "حساب", "حوصله", "جهت", "قرار"];
  const hamCompoundWords = ["اتاق", "بازی", "پایه", "قدم", "گروه", "نسل", "نگاشت", "مخرج", "وطن"];
  const comparativeExceptions = new Map([
    ["به", "بهتر"], ["که", "کهتر"], ["مه", "مهتر"], ["بیش", "بیشتر"], ["کم", "کمتر"]
  ]);
  const yayeSpokenHehWords = new Set(["گره"]);

  browser.runtime.sendMessage({ type: "autocorrect:get-rules" })
    .then((result) => {
      rules = normalizeRules(result);
      rulesReady = true;
    })
    .catch(() => {});

  browser.runtime.sendMessage({ type: "autocorrect:get-preferred-words" })
    .then((data) => {
      preferredWordSource = Array.isArray(data?.words) ? data.words : [];
      rebuildPreferredWordIndex();
    })
    .catch(() => { preferredWordsReady = true; });

  browser.storage.local.get({
    preferredWordsEnabled: true,
    preferredWordOverrides: {},
    preferredWordDisabled: [],
    halfSpaceMiEnabled: true,
    halfSpaceHaEnabled: true,
    halfSpaceSuffixEnabled: true,
    halfSpaceBiEnabled: true,
    halfSpaceComparativeEnabled: true,
    halfSpaceHamEnabled: true,
    yayeNakerahEnabled: true
  }).then((settings) => {
    preferredWordsEnabled = settings.preferredWordsEnabled !== false;
    preferredWordOverrides = settings.preferredWordOverrides && typeof settings.preferredWordOverrides === "object"
      ? settings.preferredWordOverrides
      : {};
    preferredWordDisabled = new Set(Array.isArray(settings.preferredWordDisabled)
      ? settings.preferredWordDisabled.filter((word) => typeof word === "string")
      : []);
    preferredSettingsReady = true;
    rebuildPreferredWordIndex();
    halfSpaceSettings.mi = settings.halfSpaceMiEnabled !== false;
    halfSpaceSettings.ha = settings.halfSpaceHaEnabled !== false;
    halfSpaceSettings.suffix = settings.halfSpaceSuffixEnabled !== false;
    halfSpaceSettings.bi = settings.halfSpaceBiEnabled !== false;
    halfSpaceSettings.comparative = settings.halfSpaceComparativeEnabled !== false;
    halfSpaceSettings.ham = settings.halfSpaceHamEnabled !== false;
    halfSpaceSettings.indefiniteYa = settings.yayeNakerahEnabled !== false;
    halfSpaceSettingsReady = true;
  }).catch(() => {
    halfSpaceSettingsReady = true;
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rules) {
      rules = normalizeRules(changes.rules.newValue);
      rulesReady = true;
    }
    if (changes.preferredWordsEnabled) {
      preferredWordsEnabled = changes.preferredWordsEnabled.newValue !== false;
    }
    if (changes.preferredWordOverrides) {
      preferredWordOverrides = changes.preferredWordOverrides.newValue && typeof changes.preferredWordOverrides.newValue === "object"
        ? changes.preferredWordOverrides.newValue
        : {};
      rebuildPreferredWordIndex();
    }
    if (changes.preferredWordDisabled) {
      preferredWordDisabled = new Set(Array.isArray(changes.preferredWordDisabled.newValue)
        ? changes.preferredWordDisabled.newValue.filter((word) => typeof word === "string")
        : []);
      rebuildPreferredWordIndex();
    }
    if (changes.halfSpaceMiEnabled) {
      halfSpaceSettings.mi = changes.halfSpaceMiEnabled.newValue !== false;
    }
    if (changes.halfSpaceHaEnabled) {
      halfSpaceSettings.ha = changes.halfSpaceHaEnabled.newValue !== false;
    }
    if (changes.halfSpaceSuffixEnabled) {
      halfSpaceSettings.suffix = changes.halfSpaceSuffixEnabled.newValue !== false;
    }
    if (changes.halfSpaceBiEnabled) {
      halfSpaceSettings.bi = changes.halfSpaceBiEnabled.newValue !== false;
    }
    if (changes.halfSpaceComparativeEnabled) {
      halfSpaceSettings.comparative = changes.halfSpaceComparativeEnabled.newValue !== false;
    }
    if (changes.halfSpaceHamEnabled) {
      halfSpaceSettings.ham = changes.halfSpaceHamEnabled.newValue !== false;
    }
    if (changes.yayeNakerahEnabled) {
      halfSpaceSettings.indefiniteYa = changes.yayeNakerahEnabled.newValue !== false;
    }
  });

  function normalizeRules(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item.trigger === "string" && item.trigger.length && typeof item.replace === "string")
      .slice()
      .sort((a, b) => b.trigger.length - a.trigger.length);
  }

  function isWordCharacter(char) {
    return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
  }

  function findMatch(text) {
    for (const rule of rules) {
      if (!text.endsWith(rule.trigger)) continue;
      const start = text.length - rule.trigger.length;
      const first = [...rule.trigger][0] || "";
      const previous = [...text.slice(0, start)].pop() || "";
      if (isWordCharacter(first) && isWordCharacter(previous)) continue;
      return { rule, start };
    }
    return null;
  }

  function findHalfSpaceMatch(text) {
    if (halfSpaceSettings.mi) {
      const prefixMatch = /(^|[^\p{L}\p{M}\p{N}_])(نمی|می) +([\p{L}\p{M}\u200c]+)$/u.exec(text);
      if (prefixMatch) {
        const start = prefixMatch.index + prefixMatch[1].length;
        return {
          start,
          end: text.length,
          replace: prefixMatch[2] + "\u200c" + prefixMatch[3]
        };
      }
    }

    if (halfSpaceSettings.ha) {
      const canonicalMatch = /(^|[^\p{L}\p{M}\p{N}_])[\p{L}\p{M}\u200c]+\u200c(?:هایشان|هایمان|هایتان|هایش|هایم|هایت|های|ها)$/u.exec(text);
      if (canonicalMatch) return null;

      const spacedMatch = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+) +(هایشان|هایمان|هایتان|هایش|هایم|هایت|های|ها)$/u.exec(text);
      if (spacedMatch) {
        const stem = spacedMatch[2].replace(/\u200c+$/u, "");
        const wholeWord = stem + spacedMatch[3];
        if ([...halfSpaceExceptions].some((exception) => wholeWord.startsWith(exception))) return null;
        const start = spacedMatch.index + spacedMatch[1].length;
        return { start, end: text.length, replace: stem + "\u200c" + spacedMatch[3] };
      }

      const attachedMatch = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+?)(هایشان|هایمان|هایتان|هایش|هایم|هایت|های|ها)$/u.exec(text);
      if (attachedMatch) {
        const stem = attachedMatch[2].replace(/\u200c+$/u, "");
        const wholeWord = stem + attachedMatch[3];
        if ([...halfSpaceExceptions].some((exception) => wholeWord.startsWith(exception))) return null;
        const start = attachedMatch.index + attachedMatch[1].length;
        return { start, end: text.length, replace: stem + "\u200c" + attachedMatch[3] };
      }
    }

    if (halfSpaceSettings.bi) {
      const boundary = "(^|[^\\p{L}\\p{M}\\p{N}_])";
      const biParts = biPrefixWords.join("|");
      const spacedBi = new RegExp(`${boundary}بی +(${biParts})$`, "u").exec(text);
      if (spacedBi) {
        const start = spacedBi.index + spacedBi[1].length;
        return { start, end: text.length, replace: `بی\u200c${spacedBi[2]}` };
      }
      const attachedBi = new RegExp(`${boundary}(بی(?:${biParts}))$`, "u").exec(text);
      if (attachedBi) {
        const start = attachedBi.index + attachedBi[1].length;
        return { start, end: text.length, replace: `بی\u200c${attachedBi[2].slice(2)}` };
      }
      const spacedBiChon = new RegExp(`${boundary}بی چون و چرا$`, "u").exec(text);
      if (spacedBiChon) {
        const start = spacedBiChon.index + spacedBiChon[1].length;
        return { start, end: text.length, replace: "بی\u200cچون\u200cوچرا" };
      }
      const attachedBiChon = new RegExp(`${boundary}بیچون(?:و)?چرا$`, "u").exec(text);
      if (attachedBiChon) {
        const start = attachedBiChon.index + attachedBiChon[1].length;
        return { start, end: text.length, replace: "بی\u200cچون\u200cوچرا" };
      }
    }

    if (halfSpaceSettings.comparative) {
      const spacedComparative = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+) +(ترین|تر)$/u.exec(text);
      if (spacedComparative) {
        const stem = spacedComparative[2].replace(/\u200c+$/u, "");
        const suffix = spacedComparative[3];
        const replacement = suffix === "تر" && comparativeExceptions.has(stem)
          ? comparativeExceptions.get(stem)
          : stem + "\u200c" + suffix;
        const start = spacedComparative.index + spacedComparative[1].length;
        return { start, end: text.length, replace: replacement };
      }
      const attachedSuperlative = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+)ترین$/u.exec(text);
      if (attachedSuperlative && !attachedSuperlative[2].endsWith("\u200c")) {
        const whole = attachedSuperlative[2] + "ترین";
        if (!["بهترین", "بیشترین", "کمترین", "کهترین", "مهترین", "نسترین"].includes(whole)) {
          const start = attachedSuperlative.index + attachedSuperlative[1].length;
          return { start, end: text.length, replace: attachedSuperlative[2] + "\u200cترین" };
        }
      }
    }

    if (halfSpaceSettings.ham) {
      const escapedParts = hamCompoundWords.join("|");
      const spacedHam = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])هم +(${escapedParts})$`, "u").exec(text);
      if (spacedHam) {
        const start = spacedHam.index + spacedHam[1].length;
        return { start, end: text.length, replace: `هم\u200c${spacedHam[2]}` };
      }
      const attachedHam = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])(هم(?:${escapedParts}))$`, "u").exec(text);
      if (attachedHam) {
        const start = attachedHam.index + attachedHam[1].length;
        return { start, end: text.length, replace: `هم\u200c${attachedHam[2].slice(2)}` };
      }
    }

    if (halfSpaceSettings.indefiniteYa) {
      const spacedYa = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+) +ای$/u.exec(text);
      if (spacedYa) {
        const stem = spacedYa[2].replace(/\u200c+$/u, "");
        const last = [...stem].pop();
        let replacement;
        if (stem === "جزء") replacement = "جزئی";
        else if (stem === "خلأ") replacement = "خلأی";
        else if (last === "ی") replacement = stem + "\u200cای";
        else if (last === "ه" && (yayeSpokenHehWords.has(stem) || /اه$/u.test(stem))) replacement = stem + "ی";
        else if (last === "ه") replacement = stem + "\u200cای";
        else replacement = stem + "ی";
        const start = spacedYa.index + spacedYa[1].length;
        return { start, end: text.length, replace: replacement };
      }
    }

    if (halfSpaceSettings.suffix) {
      if (/\u200c(?:ایم|ای|ام|اید|اند)$/u.test(text)) return null;

      const spacedSuffixMatch = /(^|[^\p{L}\p{M}\p{N}_])([\p{L}\p{M}\u200c]+ه) +(ایم|ای|ام|اید|اند)$/u.exec(text);
      if (spacedSuffixMatch) {
        const stem = spacedSuffixMatch[2].replace(/\u200c+$/u, "");
        const start = spacedSuffixMatch.index + spacedSuffixMatch[1].length;
        return { start, end: text.length, replace: stem + "\u200c" + spacedSuffixMatch[3] };
      }

    }

    return null;
  }

  function normalizePreferredKey(value) {
    return value.normalize("NFC")
      .replace(/[\u064b-\u0652]/gu, "")
      .replace(/[\s\u200c]+/gu, "");
  }

  function rebuildPreferredWordIndex() {
    if (!preferredSettingsReady) return;
    const candidates = new Map();
    const ambiguous = new Set();
    preferredWordMaxLength = 0;
    for (const word of preferredWordSource) {
      if (typeof word !== "string" || preferredWordDisabled.has(word)) continue;
      const key = normalizePreferredKey(word);
      if (!key) continue;
      const replacement = typeof preferredWordOverrides[word] === "string" && preferredWordOverrides[word].trim()
        ? preferredWordOverrides[word]
        : word;
      if (candidates.has(key) && candidates.get(key) !== replacement) ambiguous.add(key);
      else candidates.set(key, replacement);
      preferredWordMaxLength = Math.max(preferredWordMaxLength, word.length);
    }
    for (const key of ambiguous) candidates.delete(key);
    preferredWords = candidates;
    preferredWordsReady = true;
  }

  function isKnownJoinedBiVariant(text) {
    const key = normalizePreferredKey(text);
    return biPrefixWords.some((word) => key === normalizePreferredKey("بی" + word)) ||
      ["بیچون و چرا", "بیچونوچرا", "بیچون‌وچرا"].some((form) => key === normalizePreferredKey(form));
  }

  function findPreferredWordMatch(text) {
    if (!preferredWordsEnabled || !preferredWordsReady || !preferredWords.size) return null;
    const tailLength = Math.max(preferredWordMaxLength * 2 + 2, 2);
    const offset = Math.max(0, text.length - tailLength);
    const tail = text.slice(offset);
    for (let start = 0; start < tail.length; start++) {
      if (start > 0 && /[\p{L}\p{M}\p{N}_\u200c]/u.test(tail[start - 1])) continue;
      if (start === 0 && offset > 0 && /[\p{L}\p{M}\p{N}_\u200c]/u.test(text[offset - 1])) continue;
      const typed = tail.slice(start);
      if (!/^[\p{L}\p{M}\p{N}_\u200c ]+$/u.test(typed)) continue;
      const key = normalizePreferredKey(typed);
      const replacement = preferredWords.get(key);
      const startsBiPrefix = replacement?.startsWith("بی‌");
      const hasBiBoundary = typed.startsWith("بی ") || typed.startsWith("بی‌");
      if (startsBiPrefix && !hasBiBoundary &&
          !(halfSpaceSettings.bi && isKnownJoinedBiVariant(typed))) continue;
      if (replacement && typed !== replacement) {
        return { start: offset + start, end: text.length, replace: replacement };
      }
    }
    return null;
  }

  function findCorrection(text) {
    const exactMatch = findMatch(text);
    if (exactMatch) {
      return {
        start: exactMatch.start,
        end: text.length,
        replace: exactMatch.rule.replace
      };
    }
    const preferredMatch = findPreferredWordMatch(text);
    if (preferredMatch) return preferredMatch;
    return findHalfSpaceMatch(text);
  }

  function isDelimiter(event) {
    return event.key === "Enter" || /^[\s.,;:!?()[\]{}'"…،؛؟]$/u.test(event.key);
  }

  function onKeydown(event) {
    if (!rulesReady || !halfSpaceSettingsReady || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !isDelimiter(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.isContentEditable) {
      replaceInEditable(target);
      return;
    }
    if (target instanceof HTMLTextAreaElement) {
      replaceInInput(target);
      return;
    }
    if (target instanceof HTMLInputElement) {
      const type = (target.type || "text").toLowerCase();
      if (!["text", "search", "tel"].includes(type)) return;
      replaceInInput(target);
    }
  }

  function replaceInInput(input) {
    if (input.readOnly || input.disabled || input.selectionStart === null || input.selectionEnd === null) return;
    if (input.selectionStart !== input.selectionEnd) return;
    const caret = input.selectionStart;
    const correction = findCorrection(input.value.slice(0, caret));
    if (!correction) return;
    input.setRangeText(correction.replace, correction.start, correction.end, "end");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correction.replace
    }));
  }

  function replaceInEditable(target) {
    if (!(target instanceof HTMLElement)) return;
    const editor = target.closest('[contenteditable="true"], [contenteditable=""]') ||
      (target.isContentEditable ? target : null);
    if (!editor) return;

    const selection = document.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return;

    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(editor);
    beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
    const text = beforeCaret.toString();
    const correction = findCorrection(text);
    if (!correction) return;

    const startPoint = pointAtTextOffset(editor, correction.start);
    if (!startPoint) return;

    const replacementRange = document.createRange();
    replacementRange.setStart(startPoint.node, startPoint.offset);
    replacementRange.setEnd(selection.anchorNode, selection.anchorOffset);
    replacementRange.deleteContents();
    const inserted = document.createTextNode(correction.replace);
    replacementRange.insertNode(inserted);
    replacementRange.setStartAfter(inserted);
    replacementRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(replacementRange);
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correction.replace
    }));
  }

  function pointAtTextOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node;
    while ((node = walker.nextNode())) {
      const length = node.nodeValue.length;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    return null;
  }

  document.addEventListener("keydown", onKeydown, true);
})();

