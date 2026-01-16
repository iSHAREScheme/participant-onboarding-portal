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
	if err = db.AutoMigrate(&models.Proposal{}, &models.Settings{}); err != nil {
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

	return db, nil
}
