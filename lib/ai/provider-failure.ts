/** Public, non-leaking error categories. Never return an upstream raw body. */
export function providerFailure(status: number, body = "") {
  const text = body.slice(0, 4000).toLowerCase()
  if (status === 401 || status === 403)
    return { code: "PROVIDER_AUTH", hint: "Provider rejected this key, account access or region. Check settings; no other provider was called.", retryable: false }
  if (status === 404 || status === 410 || /model.?not.?found|model.*(retired|deprecated|not supported)/.test(text))
    return { code: "MODEL_UNAVAILABLE", hint: "Configured model is unavailable, retired, unsupported or not accessible in this region. Select a currently compatible model explicitly; no automatic replacement was used.", retryable: false }
  if (/insufficient.?quota|allocationquota|arrearage|commoditynotpurchased|quota.*exhaust/.test(text))
    return { code: "QUOTA_EXHAUSTED", hint: "Provider quota or billing access is exhausted. Processing stopped. Review the account or wait for its reset; no paid upgrade or provider switch was attempted.", retryable: false }
  if (status === 429)
    return { code: "RATE_LIMITED", hint: "Provider rate limit reached. Processing stopped; retry manually after the provider's limit resets. Local transcript tools remain available.", retryable: true }
  if (status >= 500)
    return { code: "PROVIDER_UNAVAILABLE", hint: "Provider is temporarily unavailable. Local transcript tools remain available; retry manually later.", retryable: true }
  return { code: "PROVIDER_REQUEST_FAILED", hint: "Provider rejected this request. Check input and configured model compatibility.", retryable: false }
}
