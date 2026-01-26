package grokmanager

import (
	"context"
	_ "embed"
	"fmt"
	"strings"
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

func init() {
	defaultPatterns = make(map[string]string)

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

type TestResponse struct {
	Success bool                     `json:"success"`
	Matches []map[string]interface{} `json:"matches,omitempty"`
	Total   int                      `json:"total,omitempty"`
	Matched int                      `json:"matched,omitempty"`
	Error   string                   `json:"error,omitempty"`
}

func TestPattern(req TestRequest) TestResponse {
	// Validate input sizes
	if len(req.Pattern) > MaxPatternSize {
		return TestResponse{
			Success: false,
			Error:   fmt.Sprintf("Pattern too large (max %d bytes)", MaxPatternSize),
		}
	}

	// Create grok instance with complete default patterns plus our custom patterns
	g, err := grok.NewComplete(defaultPatterns)
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

	// Split test data by newlines and parse each line
	lines := strings.Split(req.TestData, "\n")
	var allMatches []map[string]interface{}
	matchedCount := 0

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse the line
		matches, err := g.ParseTypedString(line)
		if err == nil && len(matches) > 0 {
			allMatches = append(allMatches, matches)
			matchedCount++
		}
	}

	// Check if any patterns matched
	if matchedCount == 0 {
		return TestResponse{
			Success: true,
			Total:   len(lines),
			Matched: 0,
			Error:   "Pattern did not match any test data lines",
		}
	}

	return TestResponse{
		Success: true,
		Matches: allMatches,
		Total:   len(lines),
		Matched: matchedCount,
	}
}

// GetDefaultPatterns returns a formatted string of all available default patterns
func GetDefaultPatterns() string {
	var builder strings.Builder
	builder.WriteString("# Available Default Patterns\n\n")

	// Return all available patterns (base + custom)
	for name, pattern := range allAvailablePatterns {
		if pattern != "" {
			builder.WriteString(fmt.Sprintf("%s %s\n", name, pattern))
		} else {
			builder.WriteString(fmt.Sprintf("%s\n", name))
		}
	}

	return builder.String()
}
