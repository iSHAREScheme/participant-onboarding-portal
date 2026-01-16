import React from 'react';
import styles from 'styles/components/Placeholder.module.css';

interface PlaceholderProps {
  title?: string;
  message?: string;
  imageSrc?: string;
  imageAlt?: string;
  buttonText?: string;
  buttonOnClick?: () => void;
}

const Placeholder: React.FC<PlaceholderProps> = ({
  title = "Placeholder Component",
  message = "This is a placeholder component. It can be used to show loading states or empty states.",
  imageSrc = "/placeholder-image.png",
  imageAlt = "Placeholder",
  buttonText,
  buttonOnClick,
}) => {
  return (
    <div className={styles.placeholderContainer}>
      <div className={styles.placeholderImage}>
        <img src={imageSrc} alt={imageAlt} />
      </div>
      <div className={styles.placeholderHeader}>
        <h1>{title}</h1>
      </div>
      <div className={styles.placeholderContent}>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
      </div>
      {buttonText && buttonOnClick && (
        <div className={styles.placeholderButton}>
          <button
            onClick={buttonOnClick}
            className={buttonClassName || styles.defaultButton}
          >
            {buttonText}
          </button>
        </div>
      )}
    </div>
  );
}

export default Placeholder;