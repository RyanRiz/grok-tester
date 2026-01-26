package grokmanager

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/elastic/go-grok"
)

//go:embed patterns/grok-patterns
var grokPatterns string

//go:embed patterns/aws
var awsPatterns string

//go:embed patterns/bacula
var baculaPatterns string

//go:embed patterns/bind
var bindPatterns string

//go:embed patterns/bro
var broPatterns string

//go:embed patterns/exim
var eximPatterns string

//go:embed patterns/firewalls
var firewallsPatterns string

//go:embed patterns/haproxy
var haproxyPatterns string

//go:embed patterns/httpd
var httpdPatterns string

//go:embed patterns/java
var javaPatterns string

//go:embed patterns/junos
var junosPatterns string

//go:embed patterns/linux-syslog
var linuxSyslogPatterns string

//go:embed patterns/maven
var mavenPatterns string

//go:embed patterns/mcollective
var mcollectivePatterns string

//go:embed patterns/mongodb
var mongodbPatterns string

//go:embed patterns/nagios
var nagiosPatterns string

//go:embed patterns/postfix
var postfixPatterns string

//go:embed patterns/postgresql
var postgresqlPatterns string

//go:embed patterns/rails
var railsPatterns string

//go:embed patterns/redis
var redisPatterns string

//go:embed patterns/ruby
var rubyPatterns string

//go:embed patterns/squid
var squidPatterns string

//go:embed patterns/zeek
var zeekPatterns string

const (
	MaxPatternSize = 1024 // 1KB
	CompileTimeout = 2 * time.Second
)

var defaultPatterns map[string]string
var allAvailablePatterns map[string]string
var customPatterns map[string]*sessionPatternCache
var customPatternsMu sync.RWMutex

const (
	customPatternCacheDir = "/tmp/grok-tester-custom-patterns"
	sessionPatternTTL     = 7 * 24 * time.Hour
)

type sessionPatternCache struct {
	Patterns   map[string]string `json:"patterns"`
	LastAccess int64             `json:"lastAccess"`
}

var (
	ErrCustomPatternExists   = errors.New("custom pattern already exists")
	ErrCustomPatternNotFound = errors.New("custom pattern not found")
	ErrCustomPatternInvalid  = errors.New("custom pattern invalid")
)

func init() {
	defaultPatterns = make(map[string]string)
	customPatterns = make(map[string]*sessionPatternCache)

	// Load application-specific patterns only (NewComplete() already provides base patterns)
	// Skip grokPatterns as it conflicts with library's built-in patterns
	loadPatterns(awsPatterns)
	loadPatterns(baculaPatterns)
	loadPatterns(bindPatterns)
	loadPatterns(broPatterns)
	loadPatterns(eximPatterns)
	loadPatterns(firewallsPatterns)
	loadPatterns(haproxyPatterns)
	loadPatterns(httpdPatterns)
	loadPatterns(javaPatterns)
	loadPatterns(junosPatterns)
	loadPatterns(linuxSyslogPatterns)
	loadPatterns(mavenPatterns)
	loadPatterns(mcollectivePatterns)
	loadPatterns(mongodbPatterns)
	loadPatterns(nagiosPatterns)
	loadPatterns(postfixPatterns)
	loadPatterns(postgresqlPatterns)
	loadPatterns(railsPatterns)
	loadPatterns(redisPatterns)
	loadPatterns(rubyPatterns)
	loadPatterns(squidPatterns)
	loadPatterns(zeekPatterns)

	// Create a grok instance to capture all available patterns
	allAvailablePatterns = make(map[string]string)
	g, err := grok.NewComplete(defaultPatterns)
	if err == nil {
		// Extract all patterns by testing compilation
		// Store both base patterns and custom patterns
		for k, v := range defaultPatterns {
			allAvailablePatterns[k] = v
		}

		// Add common base patterns that are always available from NewComplete()
		// These are the standard grok patterns from the library
		basePatternNames := []string{
			"USERNAME", "USER", "EMAILLOCALPART", "EMAILADDRESS", "HTTPDUSER",
			"INT", "BASE10NUM", "NUMBER", "BASE16NUM", "BASE16FLOAT",
			"POSINT", "NONNEGINT", "WORD", "NOTSPACE", "SPACE", "DATA", "GREEDYDATA",
			"QUOTEDSTRING", "UUID", "MAC", "CISCOMAC", "WINDOWSMAC", "COMMONMAC",
			"IPV6", "IPV4", "IP", "HOSTNAME", "IPORHOST", "HOSTPORT",
			"PATH", "UNIXPATH", "TTY", "WINPATH", "URIPROTO", "URIHOST",
			"URIPATH", "URIPARAM", "URIPATHPARAM", "URI",
			"MONTH", "MONTHNUM", "MONTHNUM2", "MONTHDAY", "DAY", "YEAR",
			"HOUR", "MINUTE", "SECOND", "TIME", "DATE_US", "DATE_EU",
			"ISO8601_TIMEZONE", "ISO8601_SECOND", "TIMESTAMP_ISO8601",
			"DATE", "DATESTAMP", "TZ", "DATESTAMP_RFC822", "DATESTAMP_RFC2822",
			"DATESTAMP_OTHER", "DATESTAMP_EVENTLOG", "HTTPDERROR_DATE", "HTTPDATE",
			"LOGLEVEL", "SYSLOGPROG", "SYSLOGHOST", "SYSLOGFACILITY",
			"HTTPD_COMMONLOG", "HTTPD_COMBINEDLOG", "HTTPD_ERRORLOG",
			"COMMONAPACHELOG", "COMBINEDAPACHELOG",
		}

		for _, name := range basePatternNames {
			// Try to compile with this pattern to verify it exists
			testPattern := fmt.Sprintf("%%{%s}", name)
			if err := g.Compile(testPattern, false); err == nil {
				allAvailablePatterns[name] = "" // Pattern exists but we don't have the definition
			}
		}
	}
}

func loadPatterns(content string) {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 {
			defaultPatterns[parts[0]] = parts[1]
		}
	}
}

type TestRequest struct {
	Pattern  string `json:"pattern" binding:"required"`
	TestData string `json:"testData" binding:"required"`
}

type MatchResult struct {
	Fields    map[string]interface{} `json:"fields"`
	Line      string                 `json:"line"`
	LineIndex int                    `json:"lineIndex"`
}

type TestResponse struct {
	Success    bool              `json:"success"`
	Matches    []MatchResult     `json:"matches,omitempty"`
	Total      int               `json:"total,omitempty"`
	Matched    int               `json:"matched,omitempty"`
	FieldOrder []string          `json:"fieldOrder,omitempty"`
	FieldTypes map[string]string `json:"fieldTypes,omitempty"`
	Error      string            `json:"error,omitempty"`
}

func TestPattern(sessionID string, req TestRequest) TestResponse {
	// Validate input sizes
	if len(req.Pattern) > MaxPatternSize {
		return TestResponse{
			Success: false,
			Error:   fmt.Sprintf("Pattern too large (max %d bytes)", MaxPatternSize),
		}
	}

	// Create grok instance with complete default patterns plus our custom patterns
	g, err := grok.NewComplete(getCombinedPatterns(sessionID))
	if err != nil {
		return TestResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to initialize grok: %v", err),
		}
	}

	// Compile pattern with timeout (namedCapturesOnly = true to get only explicit field names)
	compileChan := make(chan error, 1)
	ctx, cancel := context.WithTimeout(context.Background(), CompileTimeout)
	defer cancel()

	go func() {
		compileChan <- g.Compile(req.Pattern, true)
	}()

	select {
	case err := <-compileChan:
		if err != nil {
			return TestResponse{
				Success: false,
				Error:   fmt.Sprintf("Pattern compilation failed: %v", err),
			}
		}
	case <-ctx.Done():
		return TestResponse{
			Success: false,
			Error:   "Pattern compilation timeout (exceeded 2 seconds)",
		}
	}

	fieldOrder, fieldTypes := parsePatternFields(req.Pattern, getCombinedPatterns(sessionID))

	// Split test data by newlines and parse each line
	lines := strings.Split(req.TestData, "\n")
	var allMatches []MatchResult
	matchedCount := 0

	for index, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}

		// Parse the line
		matches, err := g.ParseTypedString(line)
		if err == nil && len(matches) > 0 {
			allMatches = append(allMatches, MatchResult{
				Fields:    matches,
				Line:      line,
				LineIndex: index,
			})
			matchedCount++
		}
	}

	// Check if any patterns matched
	if matchedCount == 0 {
		return TestResponse{
			Success:    true,
			Total:      len(lines),
			Matched:    0,
			FieldOrder: fieldOrder,
			FieldTypes: fieldTypes,
			Error:      "Pattern did not match any test data lines",
		}
	}

	return TestResponse{
		Success:    true,
		Matches:    allMatches,
		Total:      len(lines),
		Matched:    matchedCount,
		FieldOrder: fieldOrder,
		FieldTypes: fieldTypes,
	}
}

var grokFieldPattern = regexp.MustCompile(`%{([^}]+)}`)

func parsePatternFields(pattern string, definitions map[string]string) ([]string, map[string]string) {
	var order []string
	types := make(map[string]string)
	seen := make(map[string]bool)
	expanded := make(map[string]bool)
	inStack := make(map[string]bool)

	var parse func(string)
	parse = func(input string) {
		for _, match := range grokFieldPattern.FindAllStringSubmatch(input, -1) {
			if len(match) < 2 {
				continue
			}

			parts := strings.Split(match[1], ":")
			if len(parts) == 0 {
				continue
			}

			patternName := strings.TrimSpace(parts[0])
			fieldName := ""
			typeHint := ""
			if len(parts) > 1 {
				fieldName = strings.TrimSpace(parts[1])
			}
			if len(parts) > 2 {
				typeHint = strings.TrimSpace(parts[2])
			}

			if fieldName != "" {
				if !seen[fieldName] {
					order = append(order, fieldName)
					seen[fieldName] = true
				}
				types[fieldName] = normalizeFieldType(patternName, typeHint)
			}

			if patternName == "" {
				continue
			}

			if expanded[patternName] || inStack[patternName] {
				continue
			}

			definition, ok := definitions[patternName]
			if !ok || strings.TrimSpace(definition) == "" {
				continue
			}

			inStack[patternName] = true
			parse(definition)
			inStack[patternName] = false
			expanded[patternName] = true
		}
	}

	parse(pattern)

	return order, types
}

func normalizeFieldType(patternName, typeHint string) string {
	if typeHint != "" {
		return strings.ToLower(typeHint)
	}

	switch strings.ToUpper(patternName) {
	case "INT", "POSINT", "NONNEGINT", "BASE16NUM":
		return "int"
	case "NUMBER", "BASE10NUM", "BASE16FLOAT":
		return "float"
	default:
		return "string"
	}
}

// GetPatternsForSession returns a formatted string of all available patterns for a session
func GetPatternsForSession(sessionID string) string {
	var builder strings.Builder
	builder.WriteString("# Available Patterns\n\n")

	combined := make(map[string]string, len(allAvailablePatterns))
	for name, pattern := range allAvailablePatterns {
		combined[name] = pattern
	}

	sessionPatterns := getSessionPatterns(sessionID)
	for name, pattern := range sessionPatterns {
		combined[name] = pattern
	}

	names := make([]string, 0, len(combined))
	for name := range combined {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		pattern := combined[name]
		if pattern != "" {
			builder.WriteString(fmt.Sprintf("%s %s\n", name, pattern))
		} else {
			builder.WriteString(fmt.Sprintf("%s\n", name))
		}
	}

	return builder.String()
}

func getCombinedPatterns(sessionID string) map[string]string {
	combined := make(map[string]string, len(defaultPatterns))
	for name, pattern := range defaultPatterns {
		combined[name] = pattern
	}

	sessionPatterns := getSessionPatterns(sessionID)
	for name, pattern := range sessionPatterns {
		combined[name] = pattern
	}

	return combined
}

func ListCustomPatterns(sessionID string) map[string]string {
	return getSessionPatterns(sessionID)
}

func AddCustomPattern(sessionID, name, pattern string) error {
	name, pattern, err := normalizeCustomPattern(name, pattern)
	if err != nil {
		return err
	}

	customPatternsMu.Lock()
	defer customPatternsMu.Unlock()

	cache := getSessionCacheLocked(sessionID)
	if _, exists := cache.Patterns[name]; exists {
		return ErrCustomPatternExists
	}

	cache.Patterns[name] = pattern
	return touchSessionCacheLocked(sessionID, cache)
}

func UpdateCustomPattern(sessionID, name, pattern string) error {
	name, pattern, err := normalizeCustomPattern(name, pattern)
	if err != nil {
		return err
	}

	customPatternsMu.Lock()
	defer customPatternsMu.Unlock()

	cache := getSessionCacheLocked(sessionID)
	if _, exists := cache.Patterns[name]; !exists {
		return ErrCustomPatternNotFound
	}

	cache.Patterns[name] = pattern
	return touchSessionCacheLocked(sessionID, cache)
}

func DeleteCustomPattern(sessionID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, " \t") {
		return ErrCustomPatternInvalid
	}

	customPatternsMu.Lock()
	defer customPatternsMu.Unlock()

	cache := getSessionCacheLocked(sessionID)
	if _, exists := cache.Patterns[name]; !exists {
		return ErrCustomPatternNotFound
	}

	delete(cache.Patterns, name)
	return touchSessionCacheLocked(sessionID, cache)
}

func normalizeCustomPattern(name, pattern string) (string, string, error) {
	name = strings.TrimSpace(name)
	pattern = strings.TrimSpace(pattern)
	if name == "" || pattern == "" {
		return "", "", ErrCustomPatternInvalid
	}

	if strings.ContainsAny(name, " \t") {
		return "", "", ErrCustomPatternInvalid
	}

	return name, pattern, nil
}

func getSessionPatterns(sessionID string) map[string]string {
	customPatternsMu.Lock()
	defer customPatternsMu.Unlock()

	cache := getSessionCacheLocked(sessionID)
	if sessionID != "" {
		_ = touchSessionCacheLocked(sessionID, cache)
	}
	return copyPatternMap(cache.Patterns)
}

func sessionPatternFile(sessionID string) string {
	return filepath.Join(customPatternCacheDir, fmt.Sprintf("%s.json", sessionID))
}

func copyPatternMap(source map[string]string) map[string]string {
	copied := make(map[string]string, len(source))
	for name, pattern := range source {
		copied[name] = pattern
	}
	return copied
}

func getSessionCacheLocked(sessionID string) *sessionPatternCache {
	if sessionID == "" {
		return newSessionCache()
	}

	cache, exists := customPatterns[sessionID]
	if !exists {
		cache = loadSessionPatterns(sessionID)
	}

	if cache == nil {
		cache = newSessionCache()
	}

	if cache.Patterns == nil {
		cache.Patterns = make(map[string]string)
	}

	if isSessionExpired(cache.LastAccess) {
		_ = deleteSessionPatterns(sessionID)
		cache = newSessionCache()
	}

	customPatterns[sessionID] = cache
	return cache
}

func loadSessionPatterns(sessionID string) *sessionPatternCache {
	path := sessionPatternFile(sessionID)
	data, err := os.ReadFile(path)
	if err != nil {
		return newSessionCache()
	}

	var cache sessionPatternCache
	if err := json.Unmarshal(data, &cache); err == nil && cache.Patterns != nil {
		return &cache
	}

	var patterns map[string]string
	if err := json.Unmarshal(data, &patterns); err == nil {
		return &sessionPatternCache{
			Patterns:   patterns,
			LastAccess: time.Now().Unix(),
		}
	}

	return newSessionCache()
}

func touchSessionCacheLocked(sessionID string, cache *sessionPatternCache) error {
	if sessionID == "" || cache == nil {
		return nil
	}

	cache.LastAccess = time.Now().Unix()
	customPatterns[sessionID] = cache
	return persistSessionPatterns(sessionID, cache)
}

func persistSessionPatterns(sessionID string, cache *sessionPatternCache) error {
	if sessionID == "" || cache == nil {
		return nil
	}

	if err := os.MkdirAll(customPatternCacheDir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(sessionPatternFile(sessionID), data, 0o644)
}

func deleteSessionPatterns(sessionID string) error {
	if sessionID == "" {
		return nil
	}

	return os.Remove(sessionPatternFile(sessionID))
}

func isSessionExpired(lastAccess int64) bool {
	if lastAccess == 0 {
		return false
	}
	return time.Since(time.Unix(lastAccess, 0)) > sessionPatternTTL
}

func newSessionCache() *sessionPatternCache {
	return &sessionPatternCache{
		Patterns:   make(map[string]string),
		LastAccess: time.Now().Unix(),
	}
}
