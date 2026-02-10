import React from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export const NavConclusion = ({ mode }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleClick = () => {
        navigate("/app/conclusion");
    };

    // mode param available if needed in future

    return (
      <Button
            type="primary"
            onClick={handleClick}
            className="mr-2"
            style={{ marginTop: '12px', height: '48px', fontSize: '16px' }}
           
        >
            {t("conclusion")}
        </Button>
    );
};


export default NavConclusion;
