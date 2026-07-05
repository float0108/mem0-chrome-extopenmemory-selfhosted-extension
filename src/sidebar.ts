import { DEFAULT_USER_ID, OSS_API_BASE_DEFAULT } from './types/api';
import type { MemoriesResponse, Memory } from './types/memory';
import { SidebarAction, type SidebarActionMessage } from './types/messages';
import { StorageKey } from './types/storage';
import { buildAuthHeaders, buildDashboardUrl, sendExtensionEvent } from './utils/util_functions';
import { hasExtensionContext, storageSyncGet, storageSyncRemove } from './utils/extension_storage';

(function () {
  if (!hasExtensionContext()) {
    return;
  }

  let sidebarVisible = false;

  function initializeMem0Sidebar(): void {
    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener(
      (request: SidebarActionMessage | { action: SidebarAction.SIDEBAR_SETTINGS }) => {
        if (request.action === SidebarAction.TOGGLE_SIDEBAR) {
          void storageSyncGet([StorageKey.API_KEY, StorageKey.ACCESS_TOKEN]).then(data => {
            if (data[StorageKey.API_KEY] || data[StorageKey.ACCESS_TOKEN]) {
              toggleSidebar();
            } else {
              chrome.runtime.sendMessage({ action: SidebarAction.OPEN_POPUP });
            }
          });
        }
        if (request.action === SidebarAction.SIDEBAR_SETTINGS) {
          void storageSyncGet([StorageKey.API_KEY, StorageKey.ACCESS_TOKEN]).then(data => {
            if (data[StorageKey.API_KEY] || data[StorageKey.ACCESS_TOKEN]) {
              toggleSidebar();

              setTimeout(() => {
                const settingsTabButton = document.querySelector<HTMLButtonElement>(
                  '.tab-button[data-tab="settings"]'
                );
                settingsTabButton?.click();
              }, 200);
            }
          });
        }
        return undefined;
      }
    );
  }

  function toggleSidebar(): void {
    // Track extension usage when sidebar is toggled
    if (typeof sendExtensionEvent === 'function') {
      sendExtensionEvent();
    }
    const sidebar = document.getElementById('mem0-sidebar');
    if (sidebar) {
      // If sidebar exists, toggle its visibility
      sidebarVisible = !sidebarVisible;
      sidebar.style.right = sidebarVisible ? '0px' : '-600px';

      // Add or remove click listener based on sidebar visibility
      if (sidebarVisible) {
        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('keydown', handleEscapeKey);
        fetchMemoriesAndCount();
      } else {
        document.removeEventListener('click', handleOutsideClick);
        document.removeEventListener('keydown', handleEscapeKey);
      }
    } else {
      // If sidebar doesn't exist, create it
      createSidebar();
      sidebarVisible = true;
      document.addEventListener('click', handleOutsideClick);
      document.addEventListener('keydown', handleEscapeKey);
    }
  }

  function handleEscapeKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      const searchInput = document.querySelector('.search-memory');

      if (searchInput) {
        closeSearchInput();
      } else {
        toggleSidebar();
      }
    }
  }

  function handleOutsideClick(event: MouseEvent): void {
    const sidebar = document.getElementById('mem0-sidebar');
    if (
      sidebar &&
      !sidebar.contains(event.target as Node) &&
      !(event.target as HTMLElement)?.closest?.('.mem0-toggle-btn')
    ) {
      toggleSidebar();
    }
  }

  function createSidebar(): void {
    if (document.getElementById('mem0-sidebar')) {
      return;
    }

    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'mem0-sidebar';

    // Create fixed header
    const fixedHeader = document.createElement('div');
    fixedHeader.className = 'fixed-header';
    fixedHeader.innerHTML = `
        <div class="header">
          <div class="logo-container">
            <img src=${chrome.runtime.getURL('icons/mem0-claude-icon.png')} class="openmemory-icon" alt="OpenMemory Logo">
            <span class="openmemory-logo">OpenMemory</span>
          </div>
          <div class="header-buttons">
            <button id="closeBtn" class="close-button" title="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      `;

    // Create a container for search inputs
    const inputContainer = document.createElement('div');
    inputContainer.className = 'input-container';
    fixedHeader.appendChild(inputContainer);

    // Create tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';
    tabsContainer.innerHTML = `
      <div class="tabs">
        <button class="tab-button active" data-tab="memories">Recent Memories</button>
        <button class="tab-button" data-tab="settings">Settings</button>
      </div>
    `;
    fixedHeader.appendChild(tabsContainer);

    sidebarContainer.appendChild(fixedHeader);

    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content';

    // Create memory count display
    const memoryCountContainer = document.createElement('div');
    memoryCountContainer.className = 'total-memories';
    memoryCountContainer.innerHTML = `
      <div class="total-memories-content">
        <div>
          <p class="total-memories-label">Total Memories</p>
          <h3 class="memory-count loading">Loading...</h3>
        </div>
        <button id="openDashboardBtn" class="dashboard-button">
          Open Dashboard
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="external-link-icon">
            <path d="M7 17L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 7H17V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    // Create memories tab content
    const memoriesTabContent = document.createElement('div');
    memoriesTabContent.className = 'tab-content active';
    memoriesTabContent.id = 'memories-tab';
    memoriesTabContent.appendChild(memoryCountContainer);

    // Add memories section
    const memoriesSection = document.createElement('div');
    memoriesSection.className = 'section';
    memoriesSection.innerHTML = `
      <h2 class="section-title">Recent Memories</h2>
      <div class="memory-cards">
        <div class="memory-loader">
          <div class="loader"></div>
        </div>
      </div>
    `;
    memoriesTabContent.appendChild(memoriesSection);

    // Create settings tab content
    const settingsTabContent = document.createElement('div');
    settingsTabContent.className = 'tab-content';
    settingsTabContent.id = 'settings-tab';

    // Move memory suggestions to settings tab
    const memoryToggleSection = document.createElement('div');
    memoryToggleSection.className = 'section';
    memoryToggleSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Memory Suggestions</h2>
        <label class="switch">
          <input type="checkbox" id="mem0Toggle">
          <span class="slider"></span>
        </label>
      </div>
      <p class="section-description">Get relevant memories suggested while interacting with AI Agents</p>
    `;
    settingsTabContent.appendChild(memoryToggleSection);

    // Track searches toggle section
    const trackSearchSection = document.createElement('div');
    trackSearchSection.className = 'section';
    trackSearchSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Track searches</h2>
        <label class="switch">
          <input type="checkbox" id="trackSearchesToggle">
          <span class="slider"></span>
        </label>
      </div>
      <p class="section-description">Save searches and typed URLs as memories</p>
    `;
    settingsTabContent.appendChild(trackSearchSection);

    // Add Server URL input section
    const serverUrlSection = document.createElement('div');
    serverUrlSection.className = 'section';
    serverUrlSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Server URL</h2>
      </div>
      <input type="text" id="serverUrlInput" class="settings-input" placeholder="http://127.0.0.1:8888" value="http://127.0.0.1:8888">
      <p class="section-description">Your self-hosted mem0 API base URL (default: http://127.0.0.1:8888)</p>
    `;
    settingsTabContent.appendChild(serverUrlSection);

    // Add Dashboard URL input section
    const dashboardUrlSection = document.createElement('div');
    dashboardUrlSection.className = 'section';
    dashboardUrlSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Dashboard URL</h2>
      </div>
      <input type="text" id="dashboardUrlInput" class="settings-input" placeholder="http://localhost:3000">
      <p class="section-description">Web dashboard URL (defaults to the same host as Server URL)</p>
    `;
    settingsTabContent.appendChild(dashboardUrlSection);

    // Add API Key input section for self-hosted mode
    const apiKeySection = document.createElement('div');
    apiKeySection.className = 'section';
    apiKeySection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">API Key</h2>
      </div>
      <input type="password" id="apiKeyInput" class="settings-input" placeholder="Enter your API key">
      <p class="section-description">Required for self-hosted instances. Leave empty to use cloud OAuth.</p>
    `;
    settingsTabContent.appendChild(apiKeySection);

    // Add user ID input section
    const userIdSection = document.createElement('div');
    userIdSection.className = 'section';
    userIdSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">User ID</h2>
        <button id="userDashboardBtn" class="link-button" title="Open Users Dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link-icon lucide-external-link">
            <path d="M15 3h6v6"/>
            <path d="M10 14 21 3"/>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          </svg>
        </button>
      </div>
      <input type="text" id="userIdInput" class="settings-input" placeholder="Enter your user ID" value="seth">
    `;
    settingsTabContent.appendChild(userIdSection);

    // Add Auto-Inject toggle section
    const autoInjectSection = document.createElement('div');
    autoInjectSection.className = 'section';
    autoInjectSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Enable Auto-Inject</h2>
        <label class="switch">
          <input type="checkbox" id="autoInjectToggle" checked>
          <span class="slider"></span>
        </label>
      </div>
      <p class="section-description">Automatically inject relevant memories into conversations</p>
    `;
    // Disabling it for now as auto-inject is not working
    // settingsTabContent.appendChild(autoInjectSection);

    // Add threshold slider section
    const thresholdSection = document.createElement('div');
    thresholdSection.className = 'section';
    thresholdSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Threshold</h2>
        <span class="threshold-value">0.3</span>
      </div>
      <p class="section-description">Set the minimum similarity score for memory suggestions</p>
      <div class="slider-container">
        <input type="range" id="thresholdSlider" class="threshold-slider" min="0" max="1" step="0.1" value="0.3">
        <div class="slider-labels">
          <span>0</span>
          <span>0.5</span>
          <span>1</span>
        </div>
      </div>
    `;
    settingsTabContent.appendChild(thresholdSection);

    // Add top k section
    const topKSection = document.createElement('div');
    topKSection.className = 'section';
    topKSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Top K</h2>
      </div>
      <p class="section-description">Maximum number of memories to suggest</p>
      <input type="number" id="topKInput" class="settings-input" min="1" max="50" value="10">
    `;
    settingsTabContent.appendChild(topKSection);

    // Add save button section
    const saveSection = document.createElement('div');
    saveSection.className = 'section';
    saveSection.innerHTML = `
      <button id="saveSettingsBtn" class="save-button">
        <span class="save-text">Save Settings</span>
        <div class="save-loader" style="display: none;">
          <div class="mini-loader"></div>
        </div>
      </button>
      <div id="saveMessage" class="save-message" style="display: none;"></div>
    `;
    settingsTabContent.appendChild(saveSection);

    contentContainer.appendChild(memoriesTabContent);
    contentContainer.appendChild(settingsTabContent);
    sidebarContainer.appendChild(contentContainer);

    // Create footer with shortcut and logout
    const footerToggle = document.createElement('div');
    footerToggle.className = 'footer';
    footerToggle.innerHTML = `
      <div class="shortcut">Shortcut : ^ + M</div>
      <button id="logoutBtn" class="logout-button"><span>Clear API key</span></button>
    `;

    // Load saved settings
    chrome.storage.sync.get(
      [
        StorageKey.MEMORY_ENABLED,
        StorageKey.USER_ID,
        StorageKey.SELECTED_ORG,
        StorageKey.SELECTED_PROJECT,
        StorageKey.AUTO_INJECT_ENABLED,
        StorageKey.SIMILARITY_THRESHOLD,
        StorageKey.TOP_K,
        StorageKey.TRACK_SEARCHES,
        StorageKey.API_BASE_URL,
        StorageKey.API_KEY,
      ],
      function (result) {
        const toggleCheckbox = memoryToggleSection.querySelector('#mem0Toggle') as HTMLInputElement;
        if (toggleCheckbox) {
          toggleCheckbox.checked = result[StorageKey.MEMORY_ENABLED] !== false;
        }

        // Load track searches (default: disabled)
        const trackSearchesCheckbox = trackSearchSection.querySelector(
          '#trackSearchesToggle'
        ) as HTMLInputElement;
        if (trackSearchesCheckbox) {
          trackSearchesCheckbox.checked = result[StorageKey.TRACK_SEARCHES] === true;
        }

        const userIdInput = userIdSection.querySelector('#userIdInput') as HTMLInputElement;
        // Set saved value or keep default value
        if (result[StorageKey.USER_ID] && userIdInput) {
          userIdInput.value = result[StorageKey.USER_ID];
        }
        // If no saved value, default is already set in HTML

        // Load auto-inject setting (default: enabled)
        const autoInjectCheckbox = autoInjectSection.querySelector(
          '#autoInjectToggle'
        ) as HTMLInputElement;
        if (autoInjectCheckbox) {
          autoInjectCheckbox.checked = result[StorageKey.AUTO_INJECT_ENABLED] !== false;
        }

        // Load threshold setting (default: 0.1)
        const thresholdSlider = thresholdSection.querySelector(
          '#thresholdSlider'
        ) as HTMLInputElement;
        const thresholdValue = thresholdSection.querySelector('.threshold-value') as HTMLElement;
        const threshold =
          result[StorageKey.SIMILARITY_THRESHOLD] !== undefined
            ? result[StorageKey.SIMILARITY_THRESHOLD]
            : 0.1;
        if (thresholdSlider) {
          thresholdSlider.value = String(threshold);
        }
        if (thresholdValue) {
          thresholdValue.textContent = Number(threshold).toFixed(1);
        }

        // Load top k setting (default: 10)
        const topKInput = topKSection.querySelector('#topKInput') as HTMLInputElement;
        const topK = result[StorageKey.TOP_K] !== undefined ? result[StorageKey.TOP_K] : 10;
        if (topKInput) {
          topKInput.value = String(topK);
        }

        // Load server URL setting
        const serverUrlInput = serverUrlSection.querySelector(
          '#serverUrlInput'
        ) as HTMLInputElement;
        if (serverUrlInput && result[StorageKey.API_BASE_URL]) {
          serverUrlInput.value = result[StorageKey.API_BASE_URL];
        }

        // Load dashboard URL setting
        const dashboardUrlInput = dashboardUrlSection.querySelector(
          '#dashboardUrlInput'
        ) as HTMLInputElement;
        if (dashboardUrlInput && result.dashboardUrl) {
          dashboardUrlInput.value = result.dashboardUrl;
        }

        // Load API key setting
        const apiKeyInput = apiKeySection.querySelector('#apiKeyInput') as HTMLInputElement;
        if (apiKeyInput && result[StorageKey.API_KEY]) {
          apiKeyInput.value = result[StorageKey.API_KEY];
        }
      }
    );

    sidebarContainer.appendChild(footerToggle);

    // Add event listeners
    setupEventListeners(
      sidebarContainer,
      memoryToggleSection,
      userIdSection,
      autoInjectSection,
      thresholdSection,
      topKSection,
      saveSection,
      memoryCountContainer,
      footerToggle,
      trackSearchSection,
      serverUrlSection,
      dashboardUrlSection,
      apiKeySection
    );

    document.body.appendChild(sidebarContainer);

    // Slide in the sidebar immediately after creation
    setTimeout(() => {
      sidebarContainer.style.right = '0';
    }, 0);

    // Prevent clicks within the sidebar from closing it
    sidebarContainer.addEventListener('click', event => {
      event.stopPropagation();
    });

    // Add styles
    addStyles();

    // Fetch memories
    fetchMemoriesAndCount();
  }

  function saveSettings(
    saveBtn: HTMLButtonElement,
    saveText: HTMLElement,
    saveLoader: HTMLElement,
    saveMessage: HTMLElement,
    userIdSection: HTMLElement,
    memoryToggleSection: HTMLElement,
    autoInjectSection: HTMLElement,
    thresholdSection: HTMLElement,
    topKSection: HTMLElement,
    trackSearchSection: HTMLElement,
    serverUrlSection: HTMLElement,
    dashboardUrlSection: HTMLElement,
    apiKeySection: HTMLElement
  ): void {
    // Show loading state
    saveBtn.disabled = true;
    saveText.style.display = 'none';
    saveLoader.style.display = 'flex';
    saveMessage.style.display = 'none';

    // Get all the values
    const userIdInput = userIdSection.querySelector('#userIdInput') as HTMLInputElement;
    const toggleCheckbox = memoryToggleSection.querySelector('#mem0Toggle') as HTMLInputElement;
    const autoInjectCheckbox = autoInjectSection.querySelector(
      '#autoInjectToggle'
    ) as HTMLInputElement;
    const thresholdSlider = thresholdSection.querySelector('#thresholdSlider') as HTMLInputElement;
    const topKInput = topKSection.querySelector('#topKInput') as HTMLInputElement;
    const trackSearchesCheckbox = trackSearchSection.querySelector(
      '#trackSearchesToggle'
    ) as HTMLInputElement;
    const serverUrlInput = serverUrlSection.querySelector('#serverUrlInput') as HTMLInputElement;
    const dashboardUrlInput = dashboardUrlSection.querySelector('#dashboardUrlInput') as HTMLInputElement;
    const apiKeyInput = apiKeySection.querySelector('#apiKeyInput') as HTMLInputElement;

    const userId = (userIdInput?.value || DEFAULT_USER_ID).trim();
    const memoryEnabled = Boolean(toggleCheckbox?.checked);
    const autoInjectEnabled = Boolean(autoInjectCheckbox?.checked);
    const similarityThreshold = parseFloat(thresholdSlider?.value || '0.3');
    const topK = parseInt(topKInput?.value || '10', 10);
    const baseUrl = (serverUrlInput?.value || '').trim() || OSS_API_BASE_DEFAULT;
    const dashboardUrl = (dashboardUrlInput?.value || '').trim() || undefined;
    const apiKey = (apiKeyInput?.value || '').trim() || undefined;

    const storageData: Record<string, unknown> = {
      [StorageKey.USER_ID]: userId,
      [StorageKey.API_BASE_URL]: baseUrl,
      memory_enabled: memoryEnabled,
      auto_inject_enabled: autoInjectEnabled,
      similarity_threshold: similarityThreshold,
      top_k: topK,
      track_searches: Boolean(trackSearchesCheckbox?.checked),
    };
    if (apiKey) {
      storageData[StorageKey.API_KEY] = apiKey;
    }
    if (dashboardUrl) {
      storageData.dashboardUrl = dashboardUrl;
    }
    chrome.storage.sync.set(storageData, function () {
      if (chrome.runtime.lastError) {
        saveBtn.disabled = false;
        saveText.style.display = 'inline';
        saveLoader.style.display = 'none';
        saveMessage.style.display = 'block';
        saveMessage.className = 'save-message error';
        saveMessage.textContent = chrome.runtime.lastError.message || 'Save failed';
        return;
      }
      // Send toggle event to API
      // Send message to runtime
      chrome.runtime.sendMessage({
        action: SidebarAction.TOGGLE_MEM0,
        enabled: memoryEnabled,
      });

      // Show success message
      setTimeout(() => {
        saveBtn.disabled = false;
        saveText.style.display = 'inline';
        saveLoader.style.display = 'none';
        saveMessage.style.display = 'block';
        saveMessage.className = 'save-message success';
        saveMessage.textContent = 'Settings saved successfully!';

        // Hide message after 3 seconds
        setTimeout(() => {
          saveMessage.style.display = 'none';
        }, 3000);

        // Refresh memories with new settings
        fetchMemoriesAndCount();
      }, 500);
    });
  }

  function setupEventListeners(
    sidebarContainer: HTMLElement,
    memoryToggleSection: HTMLElement,
    userIdSection: HTMLElement,
    autoInjectSection: HTMLElement,
    thresholdSection: HTMLElement,
    topKSection: HTMLElement,
    saveSection: HTMLElement,
    memoryCountContainer: HTMLElement,
    footerToggle: HTMLElement,
    trackSearchSection: HTMLElement,
    serverUrlSection: HTMLElement,
    dashboardUrlSection: HTMLElement,
    apiKeySection: HTMLElement
  ): void {
    // Close button
    const closeBtn = sidebarContainer.querySelector('#closeBtn') as HTMLButtonElement;
    closeBtn?.addEventListener('click', toggleSidebar);

    // Tab switching
    const tabButtons = sidebarContainer.querySelectorAll<HTMLButtonElement>('.tab-button');
    const tabContents = sidebarContainer.querySelectorAll<HTMLElement>('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', function (this: HTMLButtonElement) {
        const targetTab = this.getAttribute('data-tab');

        // Remove active class from all tabs and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        this.classList.add('active');
        document.getElementById(`${targetTab}-tab`)?.classList.add('active');
      });
    });

    // Dashboard button
    const openDashboardBtn = memoryCountContainer.querySelector(
      '#openDashboardBtn'
    ) as HTMLButtonElement;
    openDashboardBtn?.addEventListener('click', openDashboard);

    // Logout button
    const logoutBtn = footerToggle.querySelector('#logoutBtn') as HTMLButtonElement;
    logoutBtn?.addEventListener('click', logout);

    // Toggle functionality is now handled by the save button

    // User dashboard link button
    const userDashboardBtn = userIdSection.querySelector('#userDashboardBtn') as HTMLButtonElement;
    userDashboardBtn?.addEventListener('click', function () {
      navigateToDashboard('/dashboard/users');
    });

    // Threshold slider event listener
    const thresholdSlider = thresholdSection.querySelector('#thresholdSlider') as HTMLInputElement;
    const thresholdValue = thresholdSection.querySelector('.threshold-value') as HTMLElement;

    thresholdSlider?.addEventListener('input', function (this: HTMLInputElement) {
      if (thresholdValue) {
        thresholdValue.textContent = parseFloat(this.value).toFixed(1);
      }
    });

    // Top K input validation
    const topKInput = topKSection.querySelector('#topKInput') as HTMLInputElement;
    topKInput?.addEventListener('input', function (this: HTMLInputElement) {
      const value = parseInt(this.value, 10);
      if (value < 1) {
        this.value = String(1);
      } else if (value > 50) {
        this.value = String(50);
      }
    });

    // Save button
    const saveBtn = saveSection.querySelector('#saveSettingsBtn') as HTMLButtonElement;
    const saveText = saveSection.querySelector('.save-text') as HTMLElement;
    const saveLoader = saveSection.querySelector('.save-loader') as HTMLElement;
    const saveMessage = saveSection.querySelector('#saveMessage') as HTMLElement;

    saveBtn?.addEventListener('click', function () {
      if (!saveBtn || !saveText || !saveLoader || !saveMessage) {
        return;
      }
      saveSettings(
        saveBtn,
        saveText,
        saveLoader,
        saveMessage,
        userIdSection,
        memoryToggleSection,
        autoInjectSection,
        thresholdSection,
        topKSection,
        trackSearchSection,
        serverUrlSection,
        dashboardUrlSection,
        apiKeySection
      );
    });
  }

  function fetchMemoriesAndCount(): void {
    void storageSyncGet([
      StorageKey.API_KEY,
      StorageKey.ACCESS_TOKEN,
      StorageKey.USER_ID,
      StorageKey.SELECTED_ORG,
      StorageKey.SELECTED_PROJECT,
      StorageKey.API_BASE_URL,
    ]).then(data => {
        const apiKey = data[StorageKey.API_KEY] as string | undefined;
        const accessToken = data[StorageKey.ACCESS_TOKEN] as string | undefined;
        if (apiKey || accessToken) {
          const headers = buildAuthHeaders(apiKey, accessToken);
          const baseUrl =
            (data[StorageKey.API_BASE_URL] as string | undefined) || OSS_API_BASE_DEFAULT;

          const params = new URLSearchParams();
          const userId = (data[StorageKey.USER_ID] as string | undefined) || DEFAULT_USER_ID;
          params.append('user_id', userId);
          params.append('top_k', '1000');

          const selectedOrg = data[StorageKey.SELECTED_ORG] as string | undefined;
          const selectedProject = data[StorageKey.SELECTED_PROJECT] as string | undefined;
          if (selectedOrg) {
            params.append('org_id', selectedOrg);
          }
          if (selectedProject) {
            params.append('project_id', selectedProject);
          }

          fetch(`${baseUrl}/memories?${params.toString()}`, {
            method: 'GET',
            headers: headers,
          })
            .then(async response => {
              const body = (await response.json()) as MemoriesResponse & { detail?: string };
              if (!response.ok) {
                const detail =
                  typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`;
                throw new Error(detail);
              }
              const results = body.results || [];
              const total = results.length;
              const countLabel =
                total >= 1000 ? '1,000+ Memories' : `${new Intl.NumberFormat().format(total)} Memories`;
              updateMemoryCount(countLabel);
              displayMemories(results);
            })
            .catch(error => {
              console.error('Error fetching memories:', error);
              updateMemoryCount('Error');
              displayErrorMessage(
                error instanceof Error ? error.message : 'Failed to load memories'
              );
            });
        } else {
          updateMemoryCount('API key required');
          displayErrorMessage('Add your API key in the extension popup');
        }
    }).catch(err => {
      console.error('Error reading extension storage:', err);
      updateMemoryCount('Setup required');
      displayErrorMessage('Open the extension popup and save your API key');
    });
  }

  function updateMemoryCount(count: number | string): void {
    const countDisplay = document.querySelector('.memory-count') as HTMLElement;
    if (countDisplay) {
      countDisplay.classList.remove('loading');
      countDisplay.textContent =
        typeof count === 'number' ? new Intl.NumberFormat().format(count) + ' Memories' : count;
    }
  }

  function closeSearchInput(): void {
    const inputContainer = document.querySelector('.input-container') as HTMLElement;
    const existingSearchInput = inputContainer?.querySelector('.search-memory');
    const searchBtn = document.getElementById('searchBtn') as HTMLElement;

    if (existingSearchInput) {
      existingSearchInput.remove();
      searchBtn?.classList.remove('active');
      // Remove filter when search is closed
      filterMemories('');
    }
  }

  function filterMemories(searchTerm: string): void {
    const memoryItems = document.querySelectorAll<HTMLElement>('.memory-item');

    memoryItems.forEach(item => {
      const memoryText = item.querySelector('.memory-text')?.textContent?.toLowerCase() || '';
      if (memoryText.includes(searchTerm)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // Add this line to maintain the width of the sidebar
    const sb = document.getElementById('mem0-sidebar') as HTMLElement;
    if (sb) {
      sb.style.width = '400px';
    }
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        
        :root {
          --bg-dark: #18181b;
          --bg-card: #27272a;
          --bg-button: #3b3b3f;
          --bg-button-hover: #4b4b4f;
          --text-white: #ffffff;
          --text-gray: #a1a1aa;
          --purple: #7a5bf7;
          --border-color: #27272a;
          --tag-bg: #3b3b3f;
          --scrollbar-bg: #18181b;
          --scrollbar-thumb: #3b3b3f;
          --success-color: #22c55e;
        }
        
        #mem0-sidebar {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          position: fixed; 
          top: 60px;
          right: 50px;
          width: 400px;
          height: auto;
          max-height: 85vh;
          background: var(--bg-dark);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          padding: 0px;
          color: var(--text-white);
          z-index: 2147483647;
          transition: right 0.3s ease-in-out;
          overflow: hidden;
          box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.5);
        }
        
        .fixed-header {
          box-sizing: border-box;
          width: 100%;
          background: var(--bg-dark);
          border-bottom: 1px solid var(--border-color);
        }
        
        .tabs-container {
          padding: 0 16px;
          background: var(--bg-dark);
          border-bottom: 1px solid var(--border-color);
        }
        
        .tabs {
          display: flex;
          gap: 0;
        }
        
        .tab-button {
          flex: 1;
          padding: 12px 16px;
          background: none;
          border: none;
          color: var(--text-gray);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s ease;
          position: relative;
          border-bottom: 2px solid transparent;
        }
        
        .tab-button.active {
          color: var(--text-white);
          border-bottom-color: var(--purple);
        }
        
        .tab-button:hover {
          color: var(--text-white);
        }
        
        .tab-content {
          display: none;
          flex-direction: column;
          gap: 24px;
        }
        
        .tab-content.active {
          display: flex;
        }
        
        .header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          width: 100%;
          height: 62px;
        }
        
        .logo-container {
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 0px;
          gap: 8px;
          height: 24px;
        }
        
        .openmemory-icon {
          width: 24px;
          height: 24px;
        }
        
        .openmemory-logo {
          height: 24px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-style: normal;
          font-weight: 600;
          font-size: 20px;
          line-height: 24px;
          letter-spacing: -0.03em;
          color: var(--text-white);
        }
        
        .header-buttons {
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 0px;
          gap: 16px;
          height: 30px;
        }
        
        .close-button {
          background: none;
          border: none;
          width: 24px;
          height: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-gray);
          font-size: 20px;
          transition: color 0.2s ease;
        }
        
        .close-button:hover {
          color: var(--text-white);
        }
        
        /* Custom scrollbar styles */
        .content {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          overflow-y: auto;
          max-height: calc(85vh - 62px - 49px - 60px); /* Subtract header, tab bar, and footer heights */
          
          /* Firefox */
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-bg);
        }
        
        /* WebKit browsers (Chrome, Safari, Edge) */
        .content::-webkit-scrollbar {
          width: 4px;
        }
        
        .content::-webkit-scrollbar-track {
          background: var(--scrollbar-bg);
        }
        
        .content::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: 4px;
          border: none;
        }
        
        .total-memories {
          background-color: var(--bg-card);
          border-radius: 8px;
          padding: 16px;
        }
        
        .total-memories-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .total-memories-label {
          color: var(--text-gray);
          font-size: 14px;
          margin-bottom: 4px;
        }
        
        .memory-count {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-style: normal;
          font-weight: 500;
          font-size: 18px;
          line-height: 140%;
          letter-spacing: -0.03em;
          color: var(--text-white);
        }
        
        .memory-count.loading {
          color: var(--text-gray);
          font-size: 16px;
        }
        
        .dashboard-button {
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 4px 8px;
          gap: 4px;
          background: var(--bg-button);
          background-opacity: 0.5;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-white);
          font-size: 14px;
        }
        
        .dashboard-button:hover {
          background: var(--bg-button-hover);
        }
        
        .external-link-icon {
          width: 14px;
          height: 14px;
        }
        
        .section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        
        .section-title {
          font-size: 18px;
          font-weight: 500;
          color: var(--text-white);
        }
        
        .section-description {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-style: normal;
          font-weight: 400;
          font-size: 14px;
          line-height: 140%;
          letter-spacing: -0.03em;
          color: var(--text-gray);
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 22px;
        }
        
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--bg-card);
          transition: .4s;
          border-radius: 34px;
        }
        
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 2px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        
        input:checked + .slider {
          background-color: var(--purple);
        }
        
        input:focus + .slider {
          box-shadow: 0 0 1px var(--purple);
        }
        
        input:checked + .slider:before {
          transform: translateX(20px);
        }
        
        .memory-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .memory-card {
          background-color: var(--bg-card);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        
        .memory-content {
          flex: 1;
          padding-right: 8px;
        }
        
        .memory-text {
          color: var(--text-gray);
          font-size: 14px;
          margin: 0 0 8px 0;
        }
        
        .memory-categories {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        
        .memory-category {
          background-color: var(--tag-bg);
          color: var(--text-white);
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
        }
        
        .memory-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        
        .memory-action-button {
          background: none;
          border: none;
          color: var(--text-gray);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
          width: 24px;
          height: 24px;
          border-radius: 4px;
        }
        
        .memory-action-button:hover {
          color: var(--text-white);
          background-color: var(--bg-button);
        }
        
        .memory-action-button.copied {
          color: var(--success-color);
        }
        
        .memory-loader {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px 0;
        }
        
        .no-memories, .memory-error {
          color: var(--text-gray);
          text-align: center;
          font-style: italic;
          padding: 20px 0;
        }
        
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-top: 1px solid var(--border-color);
        }
        
        .shortcut {
          padding: 6px 12px;
          background-color: var(--bg-card);
          color: var(--text-gray);
          border-radius: 8px;
          font-size: 14px;
        }
        
        .logout-button {
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 6px 16px;
          background: var(--bg-button);
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-white);
          font-size: 14px;
        }
        
        .logout-button:hover {
          background: var(--bg-button-hover);
        }
        
        .loader {
          border: 2px solid var(--bg-button);
          border-top: 2px solid var(--purple);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .input-container {
          width: 100%;
          padding: 0;
          box-sizing: border-box;
        }
        
        .search-memory {
          width: 100%;
          box-sizing: border-box;
          margin-top: 16px;
        }
        
        .settings-input, .settings-select {
          width: 100%;
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-white);
          font-size: 14px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: border-color 0.2s ease, background-color 0.2s ease;
          box-sizing: border-box;
        }
        
        .settings-input:focus, .settings-select:focus {
          outline: none;
          border-color: var(--purple);
          background: var(--bg-button);
        }
        
        .settings-input::placeholder {
          color: var(--text-gray);
        }
        
        .settings-select option {
          background: var(--bg-card);
          color: var(--text-white);
        }
        
        .settings-select:hover {
          border-color: var(--text-gray);
        }
        
        .link-button {
          background: none;
          border: none;
          color: var(--text-gray);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        
        .link-button:hover {
          color: var(--text-white);
          background: var(--bg-button);
        }
        
        .save-button {
          width: 100%;
          padding: 12px 24px;
          background: var(--purple);
          border: none;
          border-radius: 8px;
          color: var(--text-white);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .save-button:hover:not(:disabled) {
          background: #6d4ed6;
        }
        
        .save-button:disabled {
          background: var(--bg-button);
          cursor: not-allowed;
        }
        
        .save-loader {
          display: none;
          align-items: center;
          justify-content: center;
        }
        
        .mini-loader {
          border: 2px solid var(--bg-button);
          border-top: 2px solid var(--text-white);
          border-radius: 50%;
          width: 16px;
          height: 16px;
          animation: spin 1s linear infinite;
        }
        
        .save-message {
          margin-top: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          text-align: center;
        }
        
        .save-message.success {
          background: rgba(34, 197, 94, 0.1);
          color: var(--success-color);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        
        .save-message.error {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .threshold-value {
          color: var(--purple);
          font-weight: 600;
          font-size: 14px;
        }
        
        .slider-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .threshold-slider {
          width: 100%;
          height: 6px;
          background: var(--bg-card);
          border-radius: 3px;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
        }
        
        .threshold-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--purple);
          cursor: pointer;
          border: 2px solid var(--bg-dark);
          box-shadow: 0 0 0 1px var(--purple);
        }
        
        .threshold-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--purple);
          cursor: pointer;
          border: 2px solid var(--bg-dark);
          box-shadow: 0 0 0 1px var(--purple);
        }
        
        .threshold-slider::-webkit-slider-track {
          width: 100%;
          height: 6px;
          background: var(--bg-card);
          border-radius: 3px;
        }
        
        .threshold-slider::-moz-range-track {
          width: 100%;
          height: 6px;
          background: var(--bg-card);
          border-radius: 3px;
          border: none;
        }
        
        .threshold-slider:focus {
          outline: none;
        }
        
        .threshold-slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 2px var(--purple);
        }
        
        .threshold-slider:focus::-moz-range-thumb {
          box-shadow: 0 0 0 2px var(--purple);
        }
        
        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-gray);
          margin-top: 4px;
        }
        
        .settings-input[type="number"] {
          -moz-appearance: textfield;
        }
        
        .settings-input[type="number"]::-webkit-outer-spin-button,
        .settings-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
    `;
    document.head.appendChild(style);
  }

  function logout() {
    void storageSyncRemove([
      StorageKey.API_KEY,
      StorageKey.ACCESS_TOKEN,
      StorageKey.USER_ID_CAMEL,
    ]).then(() => {
      const sidebar = document.getElementById('mem0-sidebar');
      if (sidebar) {
        sidebar.style.right = '-500px';
      }
      chrome.runtime.sendMessage({ action: SidebarAction.OPEN_POPUP });
    });
  }

  function navigateToDashboard(path: string): void {
    void storageSyncGet(['dashboardUrl', StorageKey.API_BASE_URL]).then(data => {
      const dashboardUrl = (data.dashboardUrl as string | undefined) || '';
      const apiBaseUrl =
        (data[StorageKey.API_BASE_URL] as string | undefined) || OSS_API_BASE_DEFAULT;
      const baseUrl = buildDashboardUrl(dashboardUrl, apiBaseUrl);
      chrome.runtime.sendMessage({
        action: SidebarAction.OPEN_DASHBOARD,
        url: `${baseUrl}${path}`,
      });
    });
  }

  function openDashboard() {
    navigateToDashboard('/dashboard/memories');
  }

  // Add function to display memories
  function displayMemories(memories: Memory[]): void {
    const memoryCardsContainer = document.querySelector('.memory-cards') as HTMLElement;

    if (!memoryCardsContainer) {
      return;
    }

    // Clear loading indicator
    memoryCardsContainer.innerHTML = '';

    if (!memories || memories.length === 0) {
      memoryCardsContainer.innerHTML = '<p class="no-memories">No memories found</p>';
      return;
    }

    // Add memory cards
    memories.forEach(memory => {
      // Extract memory content from the new format
      const memoryContent = memory.memory || '';

      // Truncate long text
      const truncatedContent =
        memoryContent.length > 120 ? memoryContent.substring(0, 120) + '...' : memoryContent;

      // Get categories if available
      const categories = memory.categories || [];
      const categoryTags =
        categories.length > 0
          ? `<div class="memory-categories">${categories.map(cat => `<span class="memory-category">${cat}</span>`).join('')}</div>`
          : '';

      const memoryCard = document.createElement('div');
      memoryCard.className = 'memory-card';
      memoryCard.innerHTML = `
        <div class="memory-content">
          <p class="memory-text">${truncatedContent}</p>
          ${categoryTags}
        </div>
        <div class="memory-actions">
          <button class="memory-action-button copy-button" title="Copy Memory" data-content="${encodeURIComponent(memoryContent)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="memory-action-button view-button" title="View Memory" data-id="${memory.id || ''}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      `;

      memoryCardsContainer.appendChild(memoryCard);
    });

    // Add event listener for the copy button
    document.querySelectorAll<HTMLButtonElement>('.copy-button').forEach(button => {
      button.addEventListener('click', function (this: HTMLButtonElement, e) {
        e.stopPropagation();
        const content = decodeURIComponent(this.getAttribute('data-content') || '');

        // Copy to clipboard
        navigator.clipboard
          .writeText(content)
          .then(() => {
            // Visual feedback for copy
            const originalTitle = this.getAttribute('title') || '';
            this.setAttribute('title', 'Copied!');
            this.classList.add('copied');

            // Reset after a short delay
            setTimeout(() => {
              this.setAttribute('title', originalTitle);
              this.classList.remove('copied');
            }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy: ', err);
          });
      });
    });

    // Add event listener for the view button
    document.querySelectorAll<HTMLButtonElement>('.view-button').forEach(button => {
      button.addEventListener('click', function (this: HTMLButtonElement, e) {
        e.stopPropagation();
        const memoryId = this.getAttribute('data-id');
        if (memoryId) {
          void storageSyncGet([StorageKey.USER_ID]).then(data => {
            const userId = (data[StorageKey.USER_ID] as string | undefined) || DEFAULT_USER_ID;
            navigateToDashboard(`/dashboard/user/${userId}?memoryId=${memoryId}`);
          });
        }
      });
    });
  }

  // Add function to display error message
  function displayErrorMessage(message = 'Error loading memories') {
    const memoryCardsContainer = document.querySelector('.memory-cards');

    if (!memoryCardsContainer) {
      return;
    }

    memoryCardsContainer.innerHTML = `<p class="memory-error">${message}</p>`;
  }

  // Initialize the listener when the script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMem0Sidebar);
  } else {
    initializeMem0Sidebar();
  }
})();
