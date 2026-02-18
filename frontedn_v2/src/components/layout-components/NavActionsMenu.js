import React, { useState } from "react";
import { Drawer } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import NavItem from "./NavItem";
import NavConclusion from "./NavConclusion";
import NavOrder from "./NavOrder";
import NavReserve from "./NavReserve";
import NavBackup from "./NavBackup";
import NavMigration from "./NavMigration";
import ProviderComponent from "providerComponent";

export const NavActionsMenu = ({ mode }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const user = useSelector((state) => state.auth.user);

    const onOpen = () => {
        setOpen(true);
    };

    const onClose = () => {
        setOpen(false);
    };

    return (
        <>
            <NavItem mode={mode} onClick={onOpen}>
                <AppstoreOutlined className="nav-icon mr-0" />
            </NavItem>
            <Drawer
                title={t("actions", { defaultValue: "Actions" })}
                placement="right"
                width={320}
                onClose={onClose}
                open={open}
            >
                <div style={{ display: "grid", gap: 8 }}>
                    <NavConclusion compact onAction={onClose} />
                    <NavOrder compact onAction={onClose} />
                    <NavReserve compact onAction={onClose} />
                    <ProviderComponent rolePermission={["superAdmin"]}>
                        <NavBackup compact onAction={onClose} />
                    </ProviderComponent>
                    {user?.username === "admin01" && <NavMigration compact onAction={onClose} />}
                </div>
            </Drawer>
        </>
    );
};

export default NavActionsMenu;
