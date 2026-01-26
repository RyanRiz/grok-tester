package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"grok-tester/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	port := flag.Int("port", 8080, "Port to run the server on")
	flag.Parse()

	router := gin.Default()

	router.LoadHTMLGlob("templates/*")
	router.Static("/static", "./static")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.tmpl", gin.H{})
	})

	router.POST("/api/test", handlers.TestPatternHandler)
	router.GET("/api/patterns", handlers.GetPatternsHandler)
	router.GET("/api/custom-patterns", handlers.GetCustomPatternsHandler)
	router.POST("/api/custom-patterns", handlers.AddCustomPatternHandler)
	router.PUT("/api/custom-patterns/:name", handlers.UpdateCustomPatternHandler)
	router.DELETE("/api/custom-patterns/:name", handlers.DeleteCustomPatternHandler)

	address := fmt.Sprintf(":%d", *port)
	log.Printf("Starting Grok Pattern Tester on http://localhost:%d", *port)
	if err := router.Run(address); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
