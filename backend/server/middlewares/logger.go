package middlewares

import (
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Logger writes one line per request AFTER the handler chain has run, so the
// status code and latency are the real ones. (It used to log before c.Next(),
// which made every request read as 200 in ~7µs and hid the slow satellite
// fan-outs behind /registry/participants.) The query string is included so a
// list load's page/pageSize/filters can be matched against satellite logs.
func Logger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		status := c.Response().StatusCode()
		if err != nil {
			// Same mapping Fiber's DefaultErrorHandler applies after we return.
			var fe *fiber.Error
			if errors.As(err, &fe) {
				status = fe.Code
			} else {
				status = fiber.StatusInternalServerError
			}
		}
		fmt.Printf("[%s] %s %s - %d - %s\n",
			start.Format("2006-01-02 15:04:05"),
			c.Method(),
			c.OriginalURL(),
			status,
			time.Since(start).Round(time.Millisecond),
		)

		return err
	}
}
