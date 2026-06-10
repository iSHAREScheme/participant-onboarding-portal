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

	// Modify this section to handle migration errors better
	if err = db.AutoMigrate(
		&models.Proposal{},
		&models.Settings{},
		&models.Organization{},
		&models.OrganizationMember{},
		&models.OrganizationIdpConnection{},
	); err != nil {
		log.Printf("Database migration failed: %v", err)
		return nil, err // Return the error instead of calling log.Fatal
	}

	// Verify the table exists
	if !db.Migrator().HasTable(&models.Proposal{}) {
		return nil, fmt.Errorf("proposals table was not created successfully")
	}

	// Add SignedAgreementPaths column if it doesn't exist
	if !db.Migrator().HasColumn(&models.Proposal{}, "signed_agreement_paths") {
		if err := db.Exec("ALTER TABLE proposals ADD COLUMN signed_agreement_paths TEXT").Error; err != nil {
			return nil, err
		}
	}

	// Add SignedVia column if it doesn't exist (records manual vs eHerkenning signing)
	if !db.Migrator().HasColumn(&models.Proposal{}, "signed_via") {
		if err := db.Exec("ALTER TABLE proposals ADD COLUMN signed_via TEXT").Error; err != nil {
			return nil, err
		}
	}

	// Add identity-proof columns (eIDAS cert / eHerkenning assertion) used to
	// build the mandatory v3 identity claim at party creation.
	for _, col := range []string{"cert_subject_name", "cert_x5c", "cert_x5t_s256", "idp_assertion"} {
		if !db.Migrator().HasColumn(&models.Proposal{}, col) {
			if err := db.Exec("ALTER TABLE proposals ADD COLUMN " + col + " TEXT").Error; err != nil {
				return nil, err
			}
		}
	}

	// Add satellite-connection override columns to settings (non-secret).
	for _, col := range []string{
		"satellite_base_url", "satellite_iss", "satellite_aud", "satellite_version",
		"satellite_ep_creation_endpoint", "satellite_parties_endpoint",
		"satellite_token_endpoint", "satellite_token_scope", "dataspace_title",
	} {
		if db.Migrator().HasTable(&models.Settings{}) && !db.Migrator().HasColumn(&models.Settings{}, col) {
			if err := db.Exec("ALTER TABLE settings ADD COLUMN " + col + " TEXT").Error; err != nil {
				return nil, err
			}
		}
	}

	return db, nil
}
