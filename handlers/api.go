package handlers

import (
	"net/http"

	"grok-tester/grokmanager"

	"github.com/gin-gonic/gin"
)

// TestPatternHandler handles POST /api/test requests
func TestPatternHandler(c *gin.Context) {
	var req grokmanager.TestRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, grokmanager.TestResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	response := grokmanager.TestPattern(req)
	c.JSON(http.StatusOK, response)
}

// GetPatternsHandler returns available default patterns
func GetPatternsHandler(c *gin.Context) {
	patterns := grokmanager.GetDefaultPatterns()
	c.String(http.StatusOK, patterns)
}
