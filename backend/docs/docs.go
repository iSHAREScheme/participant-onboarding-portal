// Package docs serves the OpenAPI spec to fiber-swagger by embedding
// docs/swagger.yaml and returning it as JSON via swag.ReadDoc.
package docs

import (
    _ "embed"
    "encoding/json"

    yaml "gopkg.in/yaml.v2"

    "github.com/swaggo/swag"
)

//go:embed swagger.yaml
var swaggerYAML []byte

type embeddedSpec struct{}

// ReadDoc converts the embedded YAML spec to JSON for swagger-ui.
func (e *embeddedSpec) ReadDoc() string {
    var v interface{}
    if err := yaml.Unmarshal(swaggerYAML, &v); err != nil {
        // Fallback: return raw YAML as string (UI may not render)
        return string(swaggerYAML)
    }
    b, err := json.Marshal(v)
    if err != nil {
        return string(swaggerYAML)
    }
    return string(b)
}

func init() {
    swag.Register("swagger", &embeddedSpec{})
}
