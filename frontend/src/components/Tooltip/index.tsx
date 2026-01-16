import { useState, useRef, useEffect } from "react";
import styles from "styles/components/Tooltip.module.css";

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    placement?: "top" | "bottom";
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, placement = "bottom" }) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                triggerRef.current &&
                !triggerRef.current.contains(event.target as Node)
            ) {
                setVisible(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleTooltip = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            const offsetTop = placement === "bottom"
                ? rect.bottom + window.scrollY + 8
                : rect.top + window.scrollY - 40;

            setPosition({
                top: offsetTop,
                left: rect.left + rect.width / 2,
            });
        }
        setVisible((prev) => !prev);
    };

    return (
        <>
            <span
                ref={triggerRef}
                onClick={toggleTooltip}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleTooltip();
                    }
                }}
                tabIndex={0}
                style={{ cursor: "pointer" }}
            >
                {children}
            </span>
            {visible && (
                <div
                    className={styles.tooltip}
                    style={{
                        position: "absolute",
                        top: position.top,
                        left: position.left,
                        transform: "translateX(-50%)",
                        zIndex: 1000,
                    }}
                >
                    {content}
                </div>
            )}
        </>
    );
};

export default Tooltip;