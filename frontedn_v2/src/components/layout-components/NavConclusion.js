import React from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export const NavConclusion = ({ mode, compact = false, onAction }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleClick = () => {
        if (onAction) {
            onAction();
        }
        navigate("/app/conclusion");
    };

    // mode param available if needed in future

    return (
      <Button
            type="primary"
            onClick={handleClick}
            className={compact ? undefined : "mr-2"}
            block={compact}
            style={
                compact
                    ? { height: 40 }
                    : { marginTop: "12px", height: "48px", fontSize: "16px" }
            }
           
        >
            {t("conclusion")}
        </Button>
    );
};


export default NavConclusion;
