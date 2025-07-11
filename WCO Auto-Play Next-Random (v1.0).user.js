// ==UserScript==
// @name         WCO Auto-Play Next/Random (v1.0)
// @namespace    http://tampermonkey.net/
// @author       P3k
// @version      1.0
// @description  Autoplay with persistent toggles and proper iframe sync via postMessage
// @match        *://www.wco.tv/*
// @match        *://wco.tv/*
// @match        *://www.wco.tv/anime/*
// @match        https://embed.watchanimesub.net/inc/embed/video-js.php*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
	'use strict';

	// ============================================================================
	// 1) STUB MISSING GLOBALS (prevents errors on pages that reference these)
	// ============================================================================
	window.downloadJSAtOnload = () => {};
	window.sub = () => {};

	// ============================================================================
	// 2) IFRAME CONTEXT - Handle autoplay setup triggered by postMessage
	// ============================================================================
	if (window.top !== window.self) {
		// We're inside an iframe, listen for autoplay preferences from parent
		window.addEventListener('message', (event) => {
			if (event.data?.type === 'WCO_AUTOPLAY_PREF') {
				const autoplay = event.data.autoplay;

				if (!autoplay) {
					console.log('WCO: Auto Play disabled via postMessage');
					return;
				}

				// Observer to automatically click the play button when it appears
				const playObserver = new MutationObserver((mutations, obs) => {
					const btn = document.querySelector('button.vjs-big-play-button');
					if (btn) {
						btn.click();
						obs.disconnect();
					}
				});
				playObserver.observe(document.documentElement, { childList: true, subtree: true });

				// Observer to handle video end events
				const videoObserver = new MutationObserver((mutations, obs) => {
					const vid = document.querySelector('video');
					if (vid) {
						vid.muted = false;
						vid.addEventListener('ended', () => {
							// Notify parent page that video has ended
							window.parent.postMessage({ type: 'WCO_VIDEO_ENDED' }, '*');
						});
						obs.disconnect();
					}
				});
				videoObserver.observe(document.documentElement, { childList: true, subtree: true });
			}
		});

		return; // Exit early if we're in iframe context
	}

	// ============================================================================
	// 3) PARENT PAGE CONTEXT - Main functionality
	// ============================================================================
	const episodes = []; // Store all episodes for random selection

	// ============================================================================
	// FETCH EPISODE LIST FROM ANIME PAGE
	// ============================================================================
	window.addEventListener('DOMContentLoaded', () => {
		// Find the category link to get the anime's main page
		const categoryLink = document.querySelector('a[rel="category tag"][href*="/anime/"]');
		if (!categoryLink) {
			console.error('WCO: No category tag link found.');
			return;
		}

		const animeUrl = categoryLink.href;

		// Fetch the anime page and extract episode list
		fetch(animeUrl)
			.then(response => response.text())
			.then(html => {
				const doc = new DOMParser().parseFromString(html, 'text/html');
				// Extract all episode links from the sidebar
				doc.querySelectorAll('#sidebar_right3 .cat-eps a').forEach(a => {
					episodes.push({
						title: a.textContent.trim(),
						url: a.href
					});
				});
				console.log('WCO: fetched', episodes.length, 'episodes');
			})
			.catch(err => console.error('WCO: failed to load episode list', err));
	});

	// ============================================================================
	// CREATE CONTROL PANEL UI
	// ============================================================================
	window.addEventListener('DOMContentLoaded', () => {
		const iframe = document.querySelector('iframe[src*="video-js.php"]');
		if (!iframe) return;

		// Load saved preferences from localStorage
		const storedNext = localStorage.getItem('wco-auto-next');
		const storedRand = localStorage.getItem('wco-auto-random');
		const storedAutoPlay = localStorage.getItem('wco-auto-play');

		// Set defaults: Next=true if nothing saved, AutoPlay=true if nothing saved
		const defaultNext = (storedNext === null && storedRand === null) ? true : (storedNext === 'true');
		const defaultRand = (storedRand === 'true');
		const defaultAutoPlay = (storedAutoPlay === null) ? true : (storedAutoPlay === 'true');

		// Create main container
		const outer = document.createElement('div');
		outer.style.cssText = `
			display: flex;
			flex-direction: row;
			justify-content: center;
			gap: 16px;
			margin: 12px auto;
			font-family: sans-serif;
			font-size: 14px;
			background: transparent;
		`;

		// ============================================================================
		// SECTION 1: Next Episode Controls
		// ============================================================================
		const section1 = document.createElement('div');
		section1.style.border = '1px solid #aaa';
		section1.style.padding = '8px';
		section1.style.background = '#fff';
		section1.style.minWidth = '220px';

		const title1 = document.createElement('div');
		title1.textContent = 'Next Episode';
		title1.style.cssText = 'font-weight: bold; margin-bottom: 6px; text-align: center;';
		section1.appendChild(title1);

		const toggleRow = document.createElement('div');
		toggleRow.style.cssText = 'display: flex; flex-direction: row; gap: 16px; justify-content: center;';

		// Helper function to create toggle checkboxes
		function makeToggle(id, labelText, isChecked) {
			const label = document.createElement('label');
			label.style.cssText = 'display: flex; align-items: center; cursor: pointer; white-space: nowrap;';
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = id;
			checkbox.checked = isChecked;
			checkbox.style.marginRight = '6px';
			label.append(checkbox, document.createTextNode(labelText));
			return { label, checkbox };
		}

		// Create Next Sequential and Random toggles
		const nextToggle = makeToggle('wco-auto-next', 'Next Sequential', defaultNext);
		const randToggle = makeToggle('wco-auto-random', 'Random', defaultRand);

		// Make toggles mutually exclusive
		nextToggle.checkbox.addEventListener('change', () => {
			if (nextToggle.checkbox.checked) randToggle.checkbox.checked = false;
			savePrefs();
		});
		randToggle.checkbox.addEventListener('change', () => {
			if (randToggle.checkbox.checked) nextToggle.checkbox.checked = false;
			savePrefs();
		});

		toggleRow.append(nextToggle.label, randToggle.label);
		section1.appendChild(toggleRow);

		// ============================================================================
		// SECTION 2: Auto Play Controls
		// ============================================================================
		const section2 = document.createElement('div');
		section2.style.border = '1px solid #aaa';
		section2.style.padding = '8px';
		section2.style.background = '#fff';
		section2.style.minWidth = '140px';

		const title2 = document.createElement('div');
		title2.textContent = 'Auto Play';
		title2.style.cssText = 'font-weight: bold; margin-bottom: 6px; text-align: center;';
		section2.appendChild(title2);

		const box2Content = document.createElement('div');
		box2Content.style.cssText = 'display: flex; justify-content: center;';
		const autoPlayToggle = makeToggle('wco-auto-play', 'Enabled', defaultAutoPlay);
		autoPlayToggle.checkbox.addEventListener('change', () => {
			savePrefs();
			postAutoplayState(); // Immediately send new state to iframe
		});
		box2Content.appendChild(autoPlayToggle.label);
		section2.appendChild(box2Content);

		// Add control panel to page (after the iframe)
		outer.append(section1, section2);
		iframe.parentNode.insertBefore(outer, iframe.nextSibling);

		// Send autoplay state when iframe loads
		iframe.addEventListener('load', postAutoplayState);

		// ============================================================================
		// HELPER FUNCTIONS
		// ============================================================================

		// Save current preferences to localStorage
		function savePrefs() {
			localStorage.setItem('wco-auto-next', nextToggle.checkbox.checked);
			localStorage.setItem('wco-auto-random', randToggle.checkbox.checked);
			localStorage.setItem('wco-auto-play', autoPlayToggle.checkbox.checked);
		}

		// Send autoplay preference to iframe via postMessage
		function postAutoplayState() {
			if (iframe && iframe.contentWindow) {
				iframe.contentWindow.postMessage({
					type: 'WCO_AUTOPLAY_PREF',
					autoplay: autoPlayToggle.checkbox.checked
				}, '*');
			}
		}

		// Initial save of preferences
		savePrefs();
	});

	// ============================================================================
	// HANDLE VIDEO END EVENTS - Navigate to next episode
	// ============================================================================
	window.addEventListener('message', event => {
		if (event.data?.type === 'WCO_VIDEO_ENDED') {
			const nextChecked = localStorage.getItem('wco-auto-next') === 'true';
			const randChecked = localStorage.getItem('wco-auto-random') === 'true';

			if (randChecked && episodes.length) {
				// Random episode selection
				const choice = episodes[Math.floor(Math.random() * episodes.length)];
				window.location.href = choice.url;
			} else if (nextChecked) {
				// Sequential next episode
				const nextLink = document.querySelector('a[rel="next"]');
				if (nextLink) window.location.href = nextLink.href;
			}
		}
	});

})();
