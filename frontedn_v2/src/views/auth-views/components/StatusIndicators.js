import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { host } from "utils/api_urls";

const StatusIndicators = () => {
    const { t } = useTranslation();
    const [backendOk, setBackendOk] = useState(null);
    const [databaseOk, setDatabaseOk] = useState(null);

    const checkHealth = useCallback(async () => {
        try {
            const res = await fetch(`${host}/api/v1/health`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            const data = await res.json();
            setBackendOk(data.backend === true);
            setDatabaseOk(data.database === true);
        } catch {
            setBackendOk(false);
            setDatabaseOk(false);
        }
    }, []);

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 10000);
        return () => clearInterval(interval);
    }, [checkHealth]);

    const getColor = (status) => {
        if (status === null) return "#888";
        return status ? "#00e676" : "#ff1744";
    };

    const getStatusText = (status) => {
        if (status === null) return t("status_checking");
        return status ? t("status_working") : t("status_not_working");
    };

    return (
        <div style={styles.wrapper}>
            <Pill
                label={t("status_backend")}
                color={getColor(backendOk)}
                statusText={getStatusText(backendOk)}
            />
            <Pill
                label={t("status_database")}
                color={getColor(databaseOk)}
                statusText={getStatusText(databaseOk)}
            />
        </div>
    );
};

const Pill = ({ label, color, statusText }) => (
    <div style={styles.pill}>
        <span style={{ ...styles.dot, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}>
            <span style={{ ...styles.dotPulse, borderColor: color }} />
        </span>
        <span style={styles.label}>{label}</span>
        <span style={{ ...styles.status, color }}>{statusText}</span>
    </div>
);

const pulseKeyframes = `
@keyframes indicatorPulse {
  0% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(2.2); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}
`;

// Inject keyframes once
if (typeof document !== "undefined") {
    const styleTag = document.createElement("style");
    styleTag.textContent = pulseKeyframes;
    document.head.appendChild(styleTag);
}

const styles = {
    wrapper: {
        display: "flex",
        justifyContent: "center",
        gap: 16,
        marginTop: 16,
    },
    pill: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 24,
        padding: "6px 16px 6px 10px",
        fontSize: 13,
        fontWeight: 500,
        minWidth: 0,
    },
    dot: {
        position: "relative",
        width: 10,
        height: 10,
        borderRadius: "50%",
        display: "inline-block",
        flexShrink: 0,
    },
    dotPulse: {
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        border: "2px solid",
        animation: "indicatorPulse 2s ease-in-out infinite",
    },
    label: {
        color: "rgba(255,255,255,0.65)",
        userSelect: "none",
    },
    status: {
        fontWeight: 600,
        letterSpacing: 0.2,
    },
};

export default StatusIndicators;
