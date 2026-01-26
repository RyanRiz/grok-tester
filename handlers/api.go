package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
	"sort"

	"grok-tester/grokmanager"

	"github.com/gin-gonic/gin"
)

// TestPatternHandler handles POST /api/test requests
func TestPatternHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	var req grokmanager.TestRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, grokmanager.TestResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	response := grokmanager.TestPattern(sessionID, req)
	c.JSON(http.StatusOK, response)
}

// GetPatternsHandler returns available default patterns
func GetPatternsHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	patterns := grokmanager.GetPatternsForSession(sessionID)
	c.String(http.StatusOK, patterns)
}

type CustomPatternRequest struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type CustomPatternResponse struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

// GetCustomPatternsHandler returns all custom patterns
func GetCustomPatternsHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	patterns := grokmanager.ListCustomPatterns(sessionID)
	names := make([]string, 0, len(patterns))
	for name := range patterns {
		names = append(names, name)
	}
	sort.Strings(names)

	response := make([]CustomPatternResponse, 0, len(names))
	for _, name := range names {
		response = append(response, CustomPatternResponse{
			Name:    name,
			Pattern: patterns[name],
		})
	}

	c.JSON(http.StatusOK, response)
}

// AddCustomPatternHandler creates a new custom pattern
func AddCustomPatternHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	var req CustomPatternRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if err := grokmanager.AddCustomPattern(sessionID, req.Name, req.Pattern); err != nil {
		status := http.StatusBadRequest
		if err == grokmanager.ErrCustomPatternExists {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// UpdateCustomPatternHandler updates an existing custom pattern
func UpdateCustomPatternHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	name := c.Param("name")
	var req CustomPatternRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if err := grokmanager.UpdateCustomPattern(sessionID, name, req.Pattern); err != nil {
		status := http.StatusBadRequest
		if err == grokmanager.ErrCustomPatternNotFound {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteCustomPatternHandler removes a custom pattern
func DeleteCustomPatternHandler(c *gin.Context) {
	sessionID := getOrCreateSessionID(c)
	name := c.Param("name")
	if err := grokmanager.DeleteCustomPattern(sessionID, name); err != nil {
		status := http.StatusBadRequest
		if err == grokmanager.ErrCustomPatternNotFound {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

const sessionCookieName = "grok_session"

var sessionIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

func getOrCreateSessionID(c *gin.Context) string {
	if sessionID, err := c.Cookie(sessionCookieName); err == nil && sessionIDPattern.MatchString(sessionID) {
		return sessionID
	}

	sessionID := generateSessionID()
	c.SetCookie(sessionCookieName, sessionID, 60*60*24*30, "/", "", false, true)
	return sessionID
}

func generateSessionID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return hex.EncodeToString(make([]byte, 16))
	}
	return hex.EncodeToString(bytes)
}
