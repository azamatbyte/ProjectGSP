import React from "react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useGuardedNavigate } from "utils/hooks/useUnsavedChangesGuard";

export const NavOrder = ({ mode, compact = false, onAction }) => {
  const navigate = useGuardedNavigate();
  const { t } = useTranslation();

  const handleClick = () => {
    if (onAction) {
      onAction();
    }
    navigate("/app/cart-list");
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
      {t("main")}
    </Button>
  );
};

export default NavOrder;
