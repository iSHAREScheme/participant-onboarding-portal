package db

import (
	"fmt"
	cfg "onboardingportal/config"

	"log"
	"onboardingportal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// columnSpec is one nullable column an older database may still lack.
type columnSpec struct {
	name       string
	definition string
}

// Column definitions used by the migration lists below.
const (
	textColumn      = "TEXT"
	boolFalseColumn = "BOOLEAN DEFAULT 0"
	dateTimeColumn  = "DATETIME"
)

func Init(config *cfg.Config) (*gorm.DB, error) {
	dataSourceName := config.SQLiteDBName

	// Ensure the database file path is always inside the "db" directory, so that the docker volume mount picks it up
	// if !strings.HasPrefix(dataSourceName, "db/") && !strings.HasPrefix(dataSourceName, "db\\") {
	// 	dataSourceName = filepath.Join("db", dataSourceName)
	// }

	db, err := gorm.Open(sqlite.Open(dataSourceName), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	if err = db.AutoMigrate(
		&models.Proposal{},
		&models.Settings{},
		&models.Organization{},
		&models.OrganizationMember{},
		&models.OrganizationIdpConnection{},
		&models.VcPresentationSession{},
	); err != nil {
		log.Printf("Database migration failed: %v", err)
		return nil, err
	}

	if !db.Migrator().HasTable(&models.Proposal{}) {
		return nil, fmt.Errorf("proposals table was not created successfully")
	}
	if err := ensureProposalColumns(db); err != nil {
		return nil, err
	}
	if err := ensureSettingsColumns(db); err != nil {
		return nil, err
	}
	return db, nil
}

// ensureProposalColumns adds the columns AutoMigrate cannot add to a database
// created by an older release: the signed-agreement bookkeeping, the identity
// proof (eIDAS cert / eHerkenning assertion) behind the v3 identity claim, and
// the credential-onboarding evidence behind a pre-filled form.
func ensureProposalColumns(db *gorm.DB) error {
	columns := []columnSpec{
		{"signed_agreement_paths", textColumn},
		{"signed_via", textColumn},
		{"cert_subject_name", textColumn}, {"cert_x5c", textColumn}, {"cert_x5t_s256", textColumn}, {"idp_assertion", textColumn},
		{"id_check_method", textColumn}, {"vc_holder", textColumn}, {"vc_credential_types", textColumn}, {"vc_issuers", textColumn}, {"vc_prefill", textColumn},
		{"vc_verified", boolFalseColumn},
		{"vc_verified_at", dateTimeColumn},
	}
	return addMissingColumns(db, &models.Proposal{}, "proposals", columns)
}

// ensureSettingsColumns adds the non-secret satellite-connection overrides, the
// onboarding configuration and the one-time seed guards to an older settings table.
func ensureSettingsColumns(db *gorm.DB) error {
	if !db.Migrator().HasTable(&models.Settings{}) {
		return nil
	}
	columns := []columnSpec{}
	for _, name := range []string{
		"satellite_base_url", "satellite_iss", "satellite_aud", "satellite_version",
		"satellite_ep_creation_endpoint", "satellite_parties_endpoint",
		"satellite_token_endpoint", "satellite_token_scope", "dataspace_title",
		"auth_registry_id", "auth_registry_name", "auth_registry_url",
		"default_association_name", "skip_roles", "active_roles", "default_role",
		"auto_accept_proposal", "vc_onboarding", "vc_auto_accept_verified", "identity_methods",
	} {
		columns = append(columns, columnSpec{name, textColumn})
	}
	// Boolean guards default to false so existing rows get their built-ins
	// seeded once on the next startup.
	columns = append(columns,
		columnSpec{"agreements_initialized", boolFalseColumn},
		columnSpec{"prefill_auth_registry", boolFalseColumn},
	)
	return addMissingColumns(db, &models.Settings{}, "settings", columns)
}

// addMissingColumns issues ALTER TABLE ... ADD COLUMN for each column the model's
// table lacks. Names and definitions come from the fixed lists above, never from
// input.
func addMissingColumns(db *gorm.DB, model interface{}, table string, columns []columnSpec) error {
	for _, column := range columns {
		if db.Migrator().HasColumn(model, column.name) {
			continue
		}
		if err := db.Exec("ALTER TABLE " + table + " ADD COLUMN " + column.name + " " + column.definition).Error; err != nil {
			return err
		}
	}
	return nil
}
