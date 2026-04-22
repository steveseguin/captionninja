(function () {
	"use strict";

	var params;
	try {
		params = window.urlParams || new URLSearchParams(window.location.search);
	} catch (e) {
		return;
	}

	function hasValue(value) {
		return value !== null && value !== undefined && String(value).trim() !== "";
	}

	function isOff(value) {
		if (!hasValue(value)) {
			return false;
		}
		return /^(0|false|off|no|none|disable|disabled)$/i.test(String(value).trim());
	}

	function getParam(names) {
		for (var i = 0; i < names.length; i++) {
			if (params.has(names[i])) {
				return params.get(names[i]);
			}
		}
		return null;
	}

	function hasParam(names) {
		for (var i = 0; i < names.length; i++) {
			if (params.has(names[i])) {
				return true;
			}
		}
		return false;
	}

	function hasEnabledParam(names) {
		for (var i = 0; i < names.length; i++) {
			if (params.has(names[i]) && !isOff(params.get(names[i]))) {
				return true;
			}
		}
		return false;
	}

	function safeCssValue(value, property) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim();
		if (/[{};<>]/.test(value)) {
			return null;
		}
		if (window.CSS && window.CSS.supports && !window.CSS.supports(property, value)) {
			return null;
		}
		return value;
	}

	function normalizeColor(value) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim();
		if (isOff(value)) {
			return "transparent";
		}
		if (/^[0-9a-f]{3,4}$/i.test(value) || /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
			value = "#" + value;
		}
		if (/[{};<>]/.test(value)) {
			return null;
		}
		if (window.CSS && window.CSS.supports && window.CSS.supports("color", value)) {
			return value;
		}
		if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\([^)]+\)$/i.test(value) || /^hsla?\([^)]+\)$/i.test(value) || /^(transparent|currentcolor)$/i.test(value)) {
			return value;
		}
		return null;
	}

	function cssLength(value, defaultUnit) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim();
		if (/[{};<>]/.test(value)) {
			return null;
		}
		if (/^-?[\d.]+$/.test(value)) {
			value += defaultUnit || "px";
		}
		if (window.CSS && window.CSS.supports && !window.CSS.supports("width", value) && !window.CSS.supports("font-size", value)) {
			return null;
		}
		return value;
	}

	function cssFontSize(value) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim();
		if (/^-?[\d.]+$/.test(value)) {
			var numeric = parseFloat(value);
			value = (Math.abs(numeric) > 10) ? numeric + "px" : numeric + "em";
		}
		return safeCssValue(value, "font-size");
	}

	function cssBoxValue(value, defaultUnit) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim().replace(/,/g, " ");
		if (/[{};<>]/.test(value)) {
			return null;
		}
		var parts = value.split(/\s+/).filter(Boolean);
		if (parts.length < 1 || parts.length > 4) {
			return null;
		}
		for (var i = 0; i < parts.length; i++) {
			parts[i] = cssLength(parts[i], defaultUnit || "px");
			if (!parts[i]) {
				return null;
			}
		}
		return parts.join(" ");
	}

	function cssFontFamily(value) {
		if (!hasValue(value)) {
			return null;
		}
		value = String(value).trim();
		if (/[{};<>]/.test(value)) {
			return null;
		}
		if (window.CSS && window.CSS.supports && !window.CSS.supports("font-family", value)) {
			return null;
		}
		return value;
	}

	function parseOpacity(value) {
		if (!hasValue(value)) {
			return null;
		}
		var opacity = parseFloat(value);
		if (isNaN(opacity)) {
			return null;
		}
		if (opacity > 1) {
			opacity = opacity / 100;
		}
		return Math.max(0, Math.min(1, opacity));
	}

	function withOpacity(color, opacity) {
		if (!hasValue(color) || opacity === null || color === "transparent") {
			return null;
		}
		var match;
		color = String(color).trim();
		if (/^#[0-9a-f]{3,4}$/i.test(color)) {
			var shortHex = color.slice(1);
			return "rgba(" +
				parseInt(shortHex[0] + shortHex[0], 16) + ", " +
				parseInt(shortHex[1] + shortHex[1], 16) + ", " +
				parseInt(shortHex[2] + shortHex[2], 16) + ", " + opacity + ")";
		}
		if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) {
			var hex = color.slice(1);
			return "rgba(" +
				parseInt(hex.slice(0, 2), 16) + ", " +
				parseInt(hex.slice(2, 4), 16) + ", " +
				parseInt(hex.slice(4, 6), 16) + ", " + opacity + ")";
		}
		match = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
		if (match) {
			return "rgba(" + match[1] + ", " + match[2] + ", " + match[3] + ", " + opacity + ")";
		}
		return null;
	}

	function negativeLength(value) {
		if (value === "0" || value === "0px" || value === "0em") {
			return "0";
		}
		return String(value).charAt(0) === "-" ? String(value).slice(1) : "-" + value;
	}

	function buildOutline(width, color) {
		var neg = negativeLength(width);
		return [
			neg + " " + neg + " 0 " + color,
			"0 " + neg + " 0 " + color,
			width + " " + neg + " 0 " + color,
			neg + " 0 0 " + color,
			width + " 0 0 " + color,
			neg + " " + width + " 0 " + color,
			"0 " + width + " 0 " + color,
			width + " " + width + " 0 " + color
		].join(", ");
	}

	var rules = {};
	function addRule(selector, property, value) {
		if (!hasValue(value)) {
			return;
		}
		if (!rules[selector]) {
			rules[selector] = [];
		}
		rules[selector].push(property + ": " + value + " !important");
	}

	function addCss(cssText) {
		if (!hasValue(cssText)) {
			return;
		}
		var style = document.createElement("style");
		style.type = "text/css";
		style.textContent = cssText;
		document.head.appendChild(style);
	}

	var outputSelector = "#output, #interm";
	var spanSelector = "#output span, #interm span";
	var labelSelector = "#output .label, #interm .label";

	var noBg = hasEnabledParam(["nobg", "no-bg", "nobox", "nohighlight", "no-highlight", "transparentbg", "transparent-bg"]);
	var bgParam = getParam(["bg", "background", "captionbg", "captionbackground", "highlight", "highlightcolor", "boxcolor"]);
	var bg = noBg ? "transparent" : normalizeColor(bgParam);
	if (hasValue(bgParam) && isOff(bgParam)) {
		bg = "transparent";
	}
	var bgOpacity = parseOpacity(getParam(["bgopacity", "backgroundopacity", "boxopacity", "highlightopacity"]));
	var bgWithOpacity = withOpacity(bg, bgOpacity);
	if (bgWithOpacity) {
		bg = bgWithOpacity;
	}
	if (bg) {
		addRule(spanSelector, "background-color", bg);
		addRule(spanSelector, "background", bg);
	}

	var pageBg = normalizeColor(getParam(["pagebg", "bodybg", "screenbg", "canvasbg"]));
	if (hasEnabledParam(["transparent", "transparency"])) {
		pageBg = "transparent";
	}
	if (pageBg) {
		addRule("html, body", "background-color", pageBg);
	}

	var textColor = normalizeColor(getParam(["color", "fg", "fontcolor", "textcolor"]));
	if (textColor) {
		addRule(outputSelector, "color", textColor);
	}

	var fontFamily = cssFontFamily(getParam(["font", "fontfamily", "font-family"]));
	if (fontFamily) {
		addRule(outputSelector, "font-family", fontFamily);
	}

	var fontSize = cssFontSize(getParam(["fontsize", "font-size", "fs", "size"]));
	var scale = parseFloat(getParam(["scale", "zoom"]));
	if (!fontSize && !isNaN(scale) && scale > 0) {
		fontSize = (3.2 * scale).toFixed(3) + "em";
	}
	if (fontSize) {
		addRule(outputSelector, "font-size", fontSize);
	}

	var fontWeight = safeCssValue(getParam(["fontweight", "font-weight", "weight"]), "font-weight");
	if (fontWeight) {
		addRule(outputSelector, "font-weight", fontWeight);
	}

	var lineHeight = safeCssValue(getParam(["lineheight", "line-height", "lh"]), "line-height");
	if (lineHeight) {
		addRule(outputSelector, "line-height", lineHeight);
	}

	var letterSpacing = cssLength(getParam(["letterspacing", "letter-spacing", "spacing", "ls"]), "em");
	if (letterSpacing) {
		addRule(outputSelector, "letter-spacing", letterSpacing);
	}

	var textTransform = getParam(["texttransform", "text-transform", "transform"]);
	if (hasEnabledParam(["uppercase", "upper"])) {
		textTransform = "uppercase";
	} else if (hasEnabledParam(["lowercase", "lower"])) {
		textTransform = "lowercase";
	} else if (hasEnabledParam(["capitalize"])) {
		textTransform = "capitalize";
	}
	textTransform = safeCssValue(textTransform, "text-transform");
	if (textTransform) {
		addRule(outputSelector, "text-transform", textTransform);
	}

	var padding = cssBoxValue(getParam(["padding", "pad", "textpadding", "textpad"]), "px");
	if (padding) {
		addRule(spanSelector, "padding", padding);
	}
	var padX = cssLength(getParam(["padx", "paddingx"]), "px");
	var padY = cssLength(getParam(["pady", "paddingy"]), "px");
	if (padX) {
		addRule(spanSelector, "padding-left", padX);
		addRule(spanSelector, "padding-right", padX);
	}
	if (padY) {
		addRule(spanSelector, "padding-top", padY);
		addRule(spanSelector, "padding-bottom", padY);
	}

	var radius = cssLength(getParam(["radius", "rounded", "borderradius", "border-radius"]), "px");
	if (radius) {
		addRule(spanSelector, "border-radius", radius);
	}

	var borderColor = normalizeColor(getParam(["bordercolor", "border-color"]));
	var borderWidth = cssLength(getParam(["borderwidth", "border-width", "border"]), "px");
	if (borderColor || borderWidth) {
		addRule(spanSelector, "border-style", safeCssValue(getParam(["borderstyle", "border-style"]) || "solid", "border-style"));
		addRule(spanSelector, "border-width", borderWidth || "1px");
		addRule(spanSelector, "border-color", borderColor || "currentColor");
	}

	var captionOpacity = parseOpacity(getParam(["opacity", "captionopacity", "textopacity"]));
	if (captionOpacity !== null) {
		addRule(outputSelector, "opacity", captionOpacity);
	}

	var maxWidth = cssLength(getParam(["maxwidth", "max-width"]), "px");
	if (maxWidth) {
		addRule(spanSelector, "max-width", maxWidth);
	}
	var width = cssLength(getParam(["width"]), "px");
	if (width) {
		addRule(outputSelector, "width", width);
	}

	var align = getParam(["align", "textalign", "text-align"]);
	if (hasEnabledParam(["center", "centre"])) {
		align = "center";
	} else if (hasEnabledParam(["right", "alignright"])) {
		align = "right";
	} else if (hasEnabledParam(["left", "alignleft"])) {
		align = "left";
	}
	if (/^(left|right|center|justify)$/i.test(String(align || ""))) {
		addRule("body", "left", "0");
		addRule("body", "right", "0");
		addRule("body", "width", "auto");
		addRule(outputSelector, "text-align", align.toLowerCase());
	}

	var valign = getParam(["valign", "vertical", "position"]);
	if (hasEnabledParam(["top", "aligntop"])) {
		valign = "top";
	} else if (hasEnabledParam(["middle", "alignmiddle"])) {
		valign = "middle";
	} else if (hasEnabledParam(["alignbottom"])) {
		valign = "bottom";
	}
	if (/^(top|middle|center|bottom)$/i.test(String(valign || ""))) {
		valign = valign.toLowerCase();
		if (valign === "top") {
			addRule("body", "top", "0");
			addRule("body", "bottom", "auto");
			addRule("body", "flex-direction", "column");
		} else if (valign === "middle" || valign === "center") {
			addRule("body", "top", "50%");
			addRule("body", "bottom", "auto");
			addRule("body", "transform", "translateY(-50%)");
			addRule("body", "flex-direction", "column");
		} else if (valign === "bottom") {
			addRule("body", "top", "auto");
			addRule("body", "bottom", "0");
		}
	}

	var topPos = cssLength(getParam(["toppos", "topoffset"]), "px");
	var bottomPos = cssLength(getParam(["bottompos", "bottomoffset"]), "px");
	var leftPos = cssLength(getParam(["leftpos", "leftoffset"]), "px");
	var rightPos = cssLength(getParam(["rightpos", "rightoffset"]), "px");
	if (topPos) {
		addRule("body", "top", topPos);
		addRule("body", "bottom", "auto");
	}
	if (bottomPos) {
		addRule("body", "bottom", bottomPos);
		addRule("body", "top", "auto");
	}
	if (leftPos) {
		addRule("body", "left", leftPos);
	}
	if (rightPos) {
		addRule("body", "right", rightPos);
	}

	if (hasEnabledParam(["nowrap", "singleline"])) {
		addRule(outputSelector, "white-space", "nowrap");
		addRule(outputSelector, "overflow", "hidden");
		addRule(spanSelector, "display", "inline-block");
		addRule(spanSelector, "overflow", "hidden");
		addRule(spanSelector, "text-overflow", "ellipsis");
	} else if (hasEnabledParam(["wrap"])) {
		addRule(outputSelector, "white-space", "normal");
	}

	if (hasEnabledParam(["block", "inlineblock", "inline-block"])) {
		addRule(spanSelector, "display", "inline-block");
	}

	var shadowParam = getParam(["shadow", "textshadow", "text-shadow"]);
	var noShadow = hasEnabledParam(["noshadow", "no-shadow"]) || (hasParam(["shadow", "textshadow", "text-shadow"]) && isOff(shadowParam));
	if (noShadow) {
		addRule(outputSelector, "text-shadow", "none");
	} else {
		var shadowValue = safeCssValue(shadowParam, "text-shadow");
		if (shadowValue && !/^(1|true|on|yes)$/i.test(shadowValue)) {
			addRule(outputSelector, "text-shadow", shadowValue);
		} else {
			var shadowColor = normalizeColor(getParam(["shadowcolor", "shadow-color"]));
			var shadowX = cssLength(getParam(["shadowx", "shadow-x"]), "px");
			var shadowY = cssLength(getParam(["shadowy", "shadow-y"]), "px");
			var shadowBlur = cssLength(getParam(["shadowblur", "shadow-blur"]), "px");
			if (shadowColor || shadowX || shadowY || shadowBlur) {
				addRule(outputSelector, "text-shadow", (shadowX || "0.05em") + " " + (shadowY || "0.05em") + " " + (shadowBlur || "0px") + " " + (shadowColor || "rgba(0,0,0,1)"));
			}
		}
	}

	var outlineParam = getParam(["outline", "outlinewidth", "outline-width", "stroke", "strokewidth", "stroke-width"]);
	if (hasEnabledParam(["nooutline", "no-outline"])) {
		addRule(outputSelector, "text-shadow", "none");
	} else if (hasValue(outlineParam) && !isOff(outlineParam)) {
		var outlineWidth = cssLength(outlineParam === "" ? "2" : outlineParam, "px");
		var outlineColor = normalizeColor(getParam(["outlinecolor", "outline-color", "strokecolor", "stroke-color"])) || "#000";
		if (outlineWidth && outlineColor) {
			addRule(outputSelector, "text-shadow", buildOutline(outlineWidth, outlineColor));
		}
	}

	var labelColor = normalizeColor(getParam(["labelcolor", "label-color"]));
	var labelBg = normalizeColor(getParam(["labelbg", "labelbackground", "label-bg"]));
	if (labelColor) {
		addRule(labelSelector, "color", labelColor);
	}
	if (labelBg) {
		addRule(labelSelector, "background-color", labelBg);
		addRule(labelSelector, "background", labelBg);
	}

	var translationColor = normalizeColor(getParam(["translationcolor", "translation-color"]));
	var originalColor = normalizeColor(getParam(["originalcolor", "original-color"]));
	if (translationColor) {
		addRule("#output .dual-translation, #interm .dual-translation", "color", translationColor);
	}
	if (originalColor) {
		addRule("#output .dual-original, #interm .dual-original", "color", originalColor);
	}

	var css = "";
	for (var selector in rules) {
		if (Object.prototype.hasOwnProperty.call(rules, selector) && rules[selector].length) {
			css += selector + " { " + rules[selector].join("; ") + "; }\n";
		}
	}
	if (css) {
		addCss(css);
	}

	var cssUrl = getParam(["css", "customcssurl", "styleurl"]);
	if (hasValue(cssUrl) && !/[<>"']/.test(cssUrl)) {
		var link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = cssUrl;
		document.head.appendChild(link);
	}

	var cssBase64 = getParam(["base64css", "b64css", "cssbase64", "cssb64"]);
	if (hasValue(cssBase64)) {
		try {
			addCss(atob(cssBase64));
		} catch (e) {
			console.warn("Unable to decode overlay CSS parameter", e);
		}
	}
})();
