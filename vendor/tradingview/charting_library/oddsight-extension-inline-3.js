(function() {
		var existingCspNonce = window.__tvCspNonce || window.cspNonce;
		var currentScriptNonce = document.currentScript && (document.currentScript.getAttribute('nonce') || document.currentScript.nonce);
		var cspNonce = existingCspNonce || currentScriptNonce || undefined;
		if (cspNonce && !window.__tvCspNonce) {
			window.__tvCspNonce = cspNonce;
		}
		window.cspNonce = window.__tvCspNonce;
		cspNonce = window.__tvCspNonce;

		window.urlParams = (function () {
			var match,
				pl	 = /\+/g,  // Regex for replacing addition symbol with a space
				search = /([^&=]+)=?([^&]*)/g,
				decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')).replace(/<\/?[^>]+(>|$)/g, ''); },
				query = function() {
					// We don't use hash on the url because: safari 13 throws an error if you attempt this
					// on a blob, and safari 14 will strip hash from blob urls.
					if (frameElement && frameElement.dataset.widgetOptions) {
						return frameElement.dataset.widgetOptions;
					} else {
						throw "Unexpected use of this page";
					}
				}(),
				result = {};

			while (match = search.exec(query)) {
				result[decode(match[1])] = decode(match[2]);
			}

			var additionalSettingsObject = window.parent[result.uid];

			var customObjectNames = ['datafeed', 'customFormatters', 'brokerFactory', 'save_load_adapter', 'customTranslateFunction', 'contextMenu'];

			for (var p in additionalSettingsObject) {
				if (customObjectNames.indexOf(p) === -1) {
					result[p] = JSON.stringify(additionalSettingsObject[p]);
				}
			}

			return result;
		})();

		window.locale = urlParams.locale;
		window.language = urlParams.locale; // a very big attention needed here
		window.customTranslateFunction = window.parent[urlParams.uid].customTranslateFunction;
		window.customChartDescriptionFunction = window.parent[urlParams.uid].customChartDescriptionFunction;

		window.addCustomCSSFile = function(href) {
			var link = document.createElement('link');
			link.setAttribute('type', 'text/css');
			link.setAttribute('rel', 'stylesheet');
			link.setAttribute('href', href);
			link.setAttribute('cross-origin', 'anonymous');

			window.loadedCustomCss = new Promise((resolve) => {
				link.onload = resolve;
				link.onerror = resolve;
			});
			document.body.appendChild(link);
		};

		window.loadedCustomCss = Promise.resolve();
		if (!!urlParams.customCSS) {
			window.addCustomCSSFile(urlParams.customCSS);
		}

		window.addCustomIconsCSS = function (cssText) {
			var style = document.createElement('style');
			style.setAttribute('type', 'text/css');
			style.setAttribute('data-custom-icons', 'true');
			if (cspNonce) {
				style.setAttribute('nonce', cspNonce);
			}
			style.textContent = cssText;
			document.head.appendChild(style);
		};
		var loadingScreenParams = {};

		if (typeof urlParams.loading_screen === 'string') {
			try {
				loadingScreenParams = JSON.parse(urlParams.loading_screen);
			} catch(e) {}
		}

		var loadingIndicatorElement = document.getElementById('loading-indicator');

		if (loadingScreenParams.backgroundColor) {
			loadingIndicatorElement.style.backgroundColor = loadingScreenParams.backgroundColor;
		}

		!function(){"use strict";var t,e=new WeakMap;function n(t,n){var i=function(t){var n,i;return n=document.documentElement,e&&(i=e.get(n)),i||((i=n.ownerDocument.createRange()).selectNodeContents(n),e&&e.set(n,i)),i.createContextualFragment(t)}(t),s=i.firstElementChild;return null!==s&&i.removeChild(s),s}!function(t){t[t.Element=1]="Element",t[t.Document=9]="Document"}(t||(t={}));var i={mini:"xsmall",xxsmall:"xxsmall",xsmall:"xsmall",small:"small",medium:"medium",large:"large"};var s=function(){function t(t){var e;this._shown=!1,this._el=n((void 0===e&&(e=""),'<div class="tv-spinner '.concat(e,'" role="progressbar"></div>'))),this.setSize(i[t||"large"])}return t.prototype.spin=function(t){return this._el.classList.add("tv-spinner--shown"),void 0===this._container&&(this._container=t,void 0!==t&&t.appendChild(this._el)),this._shown=!0,this},t.prototype.stop=function(t){return t&&void 0!==this._container&&this._container.removeChild(this._el),this._el&&this._el.classList.remove("tv-spinner--shown"),this._shown=!1,this},t.prototype.setStyle=function(t){var e=this;return Object.keys(t).forEach((function(n){var i=t[n];void 0!==i&&e._el.style.setProperty(n,i)})),this},t.prototype.style=function(){return this._el.style},t.prototype.setSize=function(t){var e=void 0!==t?"tv-spinner--size_".concat(t):"";return this._el.className="tv-spinner ".concat(e," ").concat(this._shown?"tv-spinner--shown":""),this},t.prototype.getEl=function(){return this._el},t.prototype.destroy=function(){this.stop(),delete this._el,delete this._container},t}();window.Spinner=s}();


		var spinnerColor = (loadingScreenParams.foregroundColor) ? loadingScreenParams.foregroundColor : undefined;

		var loadingSpinner = new Spinner('large').setStyle({
			'--tv-spinner-color': spinnerColor,
			zIndex: String(2e9),
		});
		loadingSpinner.getEl().classList.add('spinner');
		loadingSpinner.spin(loadingIndicatorElement);
	})();
