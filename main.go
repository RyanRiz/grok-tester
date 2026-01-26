package main

import (
	"log"
	"net/http"

	"grok-tester/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	router := gin.Default()

	router.LoadHTMLGlob("templates/*")
	router.Static("/static", "./static")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.tmpl", gin.H{})
	})

	router.POST("/api/test", handlers.TestPatternHandler)
	router.GET("/api/patterns", handlers.GetPatternsHandler)

	log.Println("Starting Grok Pattern Tester on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
