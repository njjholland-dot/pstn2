package pstn2

// Wire types (docs/API-SPECIFICATION.yaml). JSON field names follow the spec.

// CpRef identifies a CP and the base URL of its PSTN2 API. The discovery URL
// is {URL}/pstn2/v1/numbers/{digits}; the API base is {URL}/pstn2/v1.
type CpRef struct {
	CPID   string `json:"cpId"`
	CPName string `json:"cpName"`
	URL    string `json:"url"`
}

// APIBase returns {url}/pstn2/v1.
func (c CpRef) APIBase() string { return trimSlash(c.URL) + "/pstn2/v1" }

// DiscoveryURL returns {url}/pstn2/v1/numbers/{digits}.
func (c CpRef) DiscoveryURL(number string) string {
	return c.APIBase() + "/numbers/" + Digits(number)
}

// KeysURL returns {url}/pstn2/v1/keys.
func (c CpRef) KeysURL() string { return c.APIBase() + "/keys" }

func trimSlash(s string) string {
	if len(s) > 0 && s[len(s)-1] == '/' {
		return s[:len(s)-1]
	}
	return s
}

// CacheControl is the caching instruction any PSTN2 response may carry (§9.4–9.5).
type CacheControl struct {
	TTL        int    `json:"ttl,omitempty"`
	Invalidate bool   `json:"invalidate,omitempty"`
	Scope      string `json:"scope,omitempty"` // "number" (default) or "block"
}

// DiscoveryResponse is a CP's answer to GET {url}/pstn2/v1/numbers/{digits} (§9.2).
type DiscoveryResponse struct {
	Version   string        `json:"version,omitempty"`
	Result    string        `json:"result"` // held | redirect | not_held (| unknown on a 404 body)
	Number    string        `json:"number,omitempty"`
	Holder    *CpRef        `json:"holder,omitempty"`
	Ported    bool          `json:"ported,omitempty"`
	PortedTo  *CpRef        `json:"portedTo,omitempty"`
	Cache     *CacheControl `json:"cache,omitempty"`
	Issued    string        `json:"issued,omitempty"`
	Kid       string        `json:"kid,omitempty"`
	Signature string        `json:"signature,omitempty"`
}

// PublicKey is one entry of a CP's key set (§9.6).
type PublicKey struct {
	Kid       string `json:"kid"`
	Algorithm string `json:"algorithm"`
	PublicKey string `json:"publicKey"` // base64 of the raw 32-byte Ed25519 key
	ValidFrom string `json:"validFrom,omitempty"`
	ValidTo   string `json:"validTo,omitempty"`
}

// KeySet is the body of GET {url}/pstn2/v1/keys.
type KeySet struct {
	CPID string      `json:"cpId"`
	Keys []PublicKey `json:"keys"`
}

// ErrorDetail is the "error" object of an ErrorResponse (§10.1).
type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp,omitempty"`
	RequestID string `json:"requestId,omitempty"`
}

// ErrorResponse is the §10.1 error body.
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

// Branding is verified caller branding (BrandingInfo).
type Branding struct {
	DisplayName     string `json:"displayName,omitempty"`
	Logo            string `json:"logo,omitempty"`
	BackgroundColor string `json:"backgroundColor,omitempty"`
	TextColor       string `json:"textColor,omitempty"`
	CallPurpose     string `json:"callPurpose,omitempty"`
}

// MediaCapabilities lists codecs and encryption offered or agreed (§6.2–6.3).
type MediaCapabilities struct {
	Codecs       []string `json:"codecs"`
	Encryption   []string `json:"encryption"`
	Video        bool     `json:"video"`
	MaxBandwidth int      `json:"maxBandwidth,omitempty"`
}

// ConnectionDetails is where to send the direct SIP INVITE (§6.1).
type ConnectionDetails struct {
	FQDN      string `json:"fqdn"`
	IPv4      string `json:"ipv4,omitempty"`
	IPv6      string `json:"ipv6,omitempty"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	PublicKey string `json:"publicKey,omitempty"`
}

// Location is caller location data (§8.1).
type Location struct {
	Latitude  float64  `json:"latitude"`
	Longitude float64  `json:"longitude"`
	Accuracy  float64  `json:"accuracy"`
	Altitude  *float64 `json:"altitude,omitempty"`
	Source    string   `json:"source,omitempty"`
}

// Address is a civic address (§8.1).
type Address struct {
	Street   string `json:"street,omitempty"`
	City     string `json:"city,omitempty"`
	Postcode string `json:"postcode,omitempty"`
	Country  string `json:"country,omitempty"`
}

// AdditionalLocationInfo is optional supporting location data (§8.1).
type AdditionalLocationInfo struct {
	CellTowerID      string   `json:"cellTowerId,omitempty"`
	WifiAccessPoints []string `json:"wifiAccessPoints,omitempty"`
	LastUpdated      string   `json:"lastUpdated,omitempty"`
}

// HolderCall describes how a module call reached the number's holder.
type HolderCall struct {
	Number    string           // the subject number (E.164)
	Holder    CpRef            // the CP that answered
	Discovery *DiscoveryResult // the discovery that found Holder
	// Retried is true when the first holder answered not_held, the cache was
	// purged and the request was retried at the rediscovered holder (§5.1.2).
	Retried bool
	// FirstDiscovery is the discovery used for the first attempt when Retried.
	FirstDiscovery *DiscoveryResult
	// NotHeldBy is the CP that answered not_held when Retried.
	NotHeldBy *CpRef
}
