import React, { useState } from "react";
import { Button, message, Modal, Upload, Progress, Alert } from "antd";
import {
    DatabaseOutlined,
    LoadingOutlined,
    UploadOutlined,
} from "@ant-design/icons";
import MigrationService from "services/MigrationService";

export const NavMigration = ({ compact = false, onAction }) => {
    const [loading, setLoading] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [fileList, setFileList] = useState([]);
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [statusChecking, setStatusChecking] = useState(false);

    const checkMigrationStatus = async () => {
        try {
            setStatusChecking(true);
            const response = await MigrationService.getMigrationStatus();
            if (response?.data?.code === 200) {
                setMigrationStatus(response.data.data);
            }
        } catch (e) {
            console.error("Failed to check migration status:", e);
            setMigrationStatus({ ready: false, error: true });
        } finally {
            setStatusChecking(false);
        }
    };

    const handleOpenModal = () => {
        if (onAction) {
            onAction();
        }
        setUploadModalOpen(true);
        setMigrationStatus(null);
        checkMigrationStatus();
    };

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning("Пожалуйста, выберите файл");
            return;
        }

        try {
            setLoading(true);

            const response = await MigrationService.uploadMigration(fileList[0]);

            if (response?.data?.code === 200) {
                message.success("Миграция завершена успешно");
                setUploadModalOpen(false);
                setFileList([]);
            } else {
                message.error(response?.data?.message || "Ошибка миграции");
            }
        } catch (e) {
            console.error("Migration error:", e);
            message.error(e?.response?.data?.message || "Ошибка миграции");
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        if (!loading) {
            setUploadModalOpen(false);
            setFileList([]);
        }
    };

    return (
        <>
            <Button
                type="default"
                icon={loading ? <LoadingOutlined spin /> : <DatabaseOutlined />}
                onClick={handleOpenModal}
                disabled={loading}
                block={compact}
                style={compact ? { height: 40 } : { marginTop: 12, height: 48, marginLeft: 8 }}
            >
                Миграция
            </Button>

            <Modal
                title="Загрузить базу Access"
                open={uploadModalOpen}
                onOk={handleUpload}
                onCancel={handleCancel}
                confirmLoading={loading}
                okText="Загрузить"
                cancelText="Отмена"
                okType="primary"
                closable={!loading}
                maskClosable={!loading}
                okButtonProps={{ disabled: !fileList.length || loading || (migrationStatus && !migrationStatus.ready) }}
            >
                {statusChecking && (
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                        <LoadingOutlined spin /> Проверка статуса...
                    </div>
                )}

                {migrationStatus && !migrationStatus.ready && (
                    <Alert
                        type="warning"
                        message="Миграция недоступна"
                        description="Скрипты миграции не найдены на сервере. Обратитесь к администратору."
                        style={{ marginBottom: 16 }}
                        showIcon
                    />
                )}

                <Upload
                    accept=".accdb,.mdb"
                    beforeUpload={(file) => {
                        const ext = file.name.toLowerCase();
                        const isAccessFile = ext.endsWith(".accdb") || ext.endsWith(".mdb");

                        if (!isAccessFile) {
                            message.error("Только файлы Access (.accdb, .mdb) разрешены");
                            return Upload.LIST_IGNORE;
                        }

                        setFileList([file]);
                        return false;
                    }}
                    onRemove={() => {
                        setFileList([]);
                    }}
                    fileList={fileList}
                    maxCount={1}
                >
                    <Button icon={<UploadOutlined />} disabled={loading}>
                        Выберите файл
                    </Button>
                </Upload>

                {loading && (
                    <div style={{ marginTop: 16 }}>
                        <Progress percent={100} status="active" showInfo={false} />
                        <div style={{ textAlign: "center", marginTop: 8, color: "#1890ff" }}>
                            Миграция выполняется... Это может занять несколько минут.
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
};

export default NavMigration;
