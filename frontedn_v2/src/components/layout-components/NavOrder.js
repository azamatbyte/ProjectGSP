import React from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export const NavOrder = ({ mode }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleClick = () => {
    navigate("/app/cart-list");
  };

  // mode param available if needed in future

  return (
    <Button
      type="primary"
      onClick={handleClick}
      className="mr-2"
      style={{ marginTop: '12px', height: '48px', fontSize: '16px' }}

    >
      {t("main")}
    </Button>
  );
};

export default NavOrder;
