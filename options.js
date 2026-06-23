const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const docButton = document.getElementById("open-doc");
const imageGenerationEnabledField = document.querySelector('[name="imageGenerationEnabled"]');
const imageSettingsGroup = document.getElementById("image-settings-group");
const promptBaseUrlHelp = document.getElementById("prompt-base-url-help");
const imageBaseUrlHelp = document.getElementById("image-base-url-help");

const PROVIDER_DOCS = {
  gemini: "https://ai.google.dev/gemini-api/docs/image-generation",
  "openai-compatible": "https://developers.openai.com/api/docs"
};

let currentSettings = null;
let promptProfileDrafts = {};
let imageProfileDrafts = {};
const imageEndpointField = document.getElementById("image-endpoint-group");

init();

async function init() {
  if (!hasExtensionRuntime()) {
    setStandaloneMode();
    return;
  }

  try {
    const settings = await sendMessage({ type: "get-settings" });
    currentSettings = settings;
    promptProfileDrafts = cloneProfiles(settings.promptProviderProfiles);
    imageProfileDrafts = cloneProfiles(settings.imageProviderProfiles);
    hydrateForm(settings);
    statusEl.textContent = "设置已载入。";
  } catch (error) {
    statusEl.textContent = error.message || "读取设置失败。";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasExtensionRuntime()) {
    statusEl.textContent = "请从 Chrome 扩展的设置页打开，不要直接打开本地 options.html 文件。";
    return;
  }

  updatePromptDraftFromForm();
  updateImageDraftFromForm();

  const payload = {
    promptProvider: getField("promptProvider")?.value || currentSettings?.promptProvider || "gemini",
    imageProvider: getField("imageProvider")?.value || currentSettings?.imageProvider || "gemini",
    apiMode: "direct",
    promptApiKey: getField("promptApiKey")?.value || "",
    promptModel: getField("promptModel")?.value || "",
    promptBaseUrl: getField("promptBaseUrl")?.value || "",
    autoAnalyze: getField("autoAnalyze")?.checked || false,
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    imageApiKey: getField("imageApiKey")?.value || "",
    imageModel: getField("imageModel")?.value || "",
    imageBaseUrl: getField("imageBaseUrl")?.value || "",
    imageEndpointPath: getField("imageEndpointPath")?.value || "",
    customProxyUrl: "",
    customProxyToken: ""
  };

  try {
    statusEl.textContent = "保存中...";
    const saved = await sendMessage({ type: "save-settings", payload });
    currentSettings = saved;
    promptProfileDrafts = cloneProfiles(saved.promptProviderProfiles);
    imageProfileDrafts = cloneProfiles(saved.imageProviderProfiles);
    hydrateForm(saved);
    statusEl.textContent = "设置已保存。";
  } catch (error) {
    statusEl.textContent = error.message || "保存失败。";
  }
});

imageGenerationEnabledField?.addEventListener("change", syncImageSettingsVisibility);

// Add provider change listeners
const promptProviderField = getField("promptProvider");
const imageProviderField = getField("imageProvider");

promptProviderField?.addEventListener("change", () => {
  syncPromptProviderUI(promptProviderField.value);
});

imageProviderField?.addEventListener("change", () => {
  syncImageProviderUI(imageProviderField.value);
});

docButton.addEventListener("click", () => {
  const provider = currentSettings?.promptProvider || "gemini";
  const url = PROVIDER_DOCS[provider] || PROVIDER_DOCS.gemini;
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
});

function hydrateForm(settings) {
  hydratePromptFields(
    settings.promptProvider || "gemini",
    settings.promptProviderProfiles?.[settings.promptProvider || "gemini"] || {
      apiKey: settings.promptApiKey,
      model: settings.promptModel,
      baseUrl: settings.promptBaseUrl,
      autoAnalyze: settings.autoAnalyze
    }
  );
  hydrateImageFields(
    settings.imageProvider || "gemini",
    settings.imageProviderProfiles?.[settings.imageProvider || "gemini"] || {
      apiKey: settings.imageApiKey,
      model: settings.imageModel,
      baseUrl: settings.imageBaseUrl,
      imageGenerationEnabled: settings.imageGenerationEnabled
    }
  );
}

function hydratePromptFields(provider, source) {
  const merged = normalizePromptProfile(provider, source);

  setSelectValue("promptProvider", provider);
  setFieldValue("promptApiKey", merged.apiKey);
  setFieldValue("promptModel", merged.model);
  setFieldValue("promptBaseUrl", merged.baseUrl);
  setCheckboxValue("autoAnalyze", merged.autoAnalyze);
  syncPromptProviderUI(provider);
}

function hydrateImageFields(provider, source) {
  const merged = normalizeImageProfile(provider, source);

  setSelectValue("imageProvider", provider);
  setCheckboxValue("imageGenerationEnabled", merged.imageGenerationEnabled);
  setFieldValue("imageApiKey", merged.apiKey);
  setFieldValue("imageModel", merged.model);
  setFieldValue("imageBaseUrl", merged.baseUrl);
  setFieldValue("imageEndpointPath", merged.endpointPath);
  syncImageSettingsVisibility();
  syncImageProviderUI(provider);
}

function updatePromptDraftFromForm(provider = currentSettings?.promptProvider || "gemini") {
  promptProfileDrafts[provider] = normalizePromptProfile(provider, {
    apiKey: getField("promptApiKey")?.value || "",
    model: getField("promptModel")?.value || "",
    baseUrl: getField("promptBaseUrl")?.value || "",
    autoAnalyze: getField("autoAnalyze")?.checked || false
  });
}

function updateImageDraftFromForm(provider = currentSettings?.imageProvider || "gemini") {
  imageProfileDrafts[provider] = normalizeImageProfile(provider, {
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    apiKey: getField("imageApiKey")?.value || "",
    model: getField("imageModel")?.value || "",
    baseUrl: getField("imageBaseUrl")?.value || "",
    endpointPath: getField("imageEndpointPath")?.value || ""
  });
}

function syncPromptProviderUI(provider) {
  const isOpenAICompatible = provider === "openai-compatible";
  const isMinimax = provider === "minimax";
  const promptModelField = getField("promptModel");
  const promptBaseUrlField = getField("promptBaseUrl");

  if (promptModelField) {
    promptModelField.placeholder = isMinimax ? "MiniMax-Text-01"
      : isOpenAICompatible ? "gpt-4.1-mini"
      : "gemini-2.5-flash";
  }
  if (promptBaseUrlField) {
    promptBaseUrlField.placeholder = isMinimax ? "https://api.minimax.chat/v1"
      : isOpenAICompatible ? "https://api.openai.com/v1"
      : "https://generativelanguage.googleapis.com/v1beta";
  }
  if (promptBaseUrlHelp) {
    promptBaseUrlHelp.textContent = isMinimax
      ? "MiniMax 使用 OpenAI 兼容接口，默认地址 https://api.minimax.chat/v1"
      : isOpenAICompatible
      ? "OpenAI Compatible 默认带入 https://api.openai.com/v1，也可以改成其他兼容网关。"
      : "Gemini 默认使用 Google 官方 REST 地址。";
  }
}

function syncImageProviderUI(provider) {
  const isOpenAICompatible = provider === "openai-compatible";
  const isMinimax = provider === "minimax";
  const imageModelField = getField("imageModel");
  const imageBaseUrlField = getField("imageBaseUrl");
  const imageEndpointFieldEl = document.getElementById("image-endpoint-group");

  if (imageModelField) {
    imageModelField.placeholder = isMinimax ? "MiniMax-Image-01"
      : isOpenAICompatible ? "gpt-image-2"
      : "gemini-2.0-flash-exp-image-generation";
  }
  if (imageBaseUrlField) {
    imageBaseUrlField.placeholder = isMinimax ? "https://api.minimax.chat/v1"
      : isOpenAICompatible ? "https://api.openai.com/v1"
      : "https://generativelanguage.googleapis.com/v1beta";
  }
  if (imageBaseUrlHelp) {
    imageBaseUrlHelp.textContent = isMinimax
      ? "MiniMax 使用 OpenAI 兼容接口，默认地址 https://api.minimax.chat/v1"
      : isOpenAICompatible
      ? "OpenAI Compatible 默认带入 https://api.openai.com/v1，也可以改成其他兼容网关。"
      : "Gemini 默认使用 Google 官方 REST 地址。";
  }
  if (imageEndpointFieldEl) {
    imageEndpointFieldEl.style.display = (isOpenAICompatible || isMinimax) ? "" : "none";
  }
}

function setFieldValue(name, value) {
  const field = getField(name);
  if (field) field.value = value ?? "";
}

function setCheckboxValue(name, value) {
  const field = getField(name);
  if (field) field.checked = Boolean(value);
}

function setSelectValue(name, value) {
  const field = getField(name);
  if (field) field.value = value ?? "";
}

function getField(name) {
  return document.querySelector(`[name="${CSS.escape(name)}"]`);
}

function syncImageSettingsVisibility() {
  const enabled = Boolean(imageGenerationEnabledField?.checked);
  imageSettingsGroup?.classList.toggle("is-hidden", !enabled);
}

function cloneProfiles(value) {
  const source = value && typeof value === "object" ? value : {};
  return JSON.parse(JSON.stringify(source));
}

function getPromptProviderDefaults(provider) {
  if (provider === "openai-compatible") {
    return {
      apiKey: "",
      model: "gpt-5.5",
      baseUrl: "https://api.openai.com/v1",
      autoAnalyze: true
    };
  }

  return {
    apiKey: "",
    model: "gemini-3.1-pro-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    autoAnalyze: true
  };
}

function getImageProviderDefaults(provider) {
  if (provider === "openai-compatible") {
    return {
      imageGenerationEnabled: true,
      apiKey: "",
      model: "gpt-image-2",
      baseUrl: "https://api.openai.com/v1",
      endpointPath: "/images/generations"
    };
  }

  return {
    imageGenerationEnabled: true,
    apiKey: "",
    model: "gemini-3.1-flash-image-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    endpointPath: ""
  };
}

function normalizePromptProfile(provider, source) {
  const defaults = getPromptProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: String(input.baseUrl || defaults.baseUrl),
    autoAnalyze: "autoAnalyze" in input ? Boolean(input.autoAnalyze) : defaults.autoAnalyze
  };
}

function normalizeImageProfile(provider, source) {
  const defaults = getImageProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    imageGenerationEnabled:
      "imageGenerationEnabled" in input
        ? Boolean(input.imageGenerationEnabled)
        : defaults.imageGenerationEnabled,
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: String(input.baseUrl || defaults.baseUrl),
    endpointPath: String(input.endpointPath || defaults.endpointPath)
  };
}

function hasExtensionRuntime() {
  return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage);
}

function setStandaloneMode() {
  for (const field of form.querySelectorAll("input, select, button[type='submit']")) {
    field.disabled = true;
  }
  statusEl.textContent = "当前页面是本地预览。请到 chrome://extensions 打开“图生灵 Preview”的扩展设置页进行配置。";
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Options request failed.");
  }
  return response.data;
}
