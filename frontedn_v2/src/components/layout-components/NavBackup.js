import React, { useState } from "react";
import { Button, message, Modal, Upload, Input, Select } from "antd";
import { useTranslation } from "react-i18next";
import {
  DownloadOutlined,
  LoadingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import AuthService from "services/AuthService";

export const NavBackup = ({ compact = false, onAction }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [password, setPassword] = useState("");
  const [backupType, setBackupType] = useState("csv");
  const [restoreType, setRestoreType] = useState("csv");

  /* ================= DOWNLOAD ================= */
  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleOpenDownloadModal = () => {
    if (onAction) {
      onAction();
    }
    setDownloadModalOpen(true);
  };

  const handleDownload = async () => {
    try {
      setLoading(true);

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      let response;
      let filename;

      if (backupType === "pg") {
        response = await AuthService.backupPg();
        filename = `pgdump_${timestamp}.zip`;
      } else {
        response = await AuthService.backup({
          format: "csv",
          compress: true,
        });
        filename = `export_${timestamp}.zip`;
      }

      const passwordFromHeader =
        response.headers?.["x-backup-password"];
      const blob = response.data;

      if (blob instanceof Blob) {
        downloadBlob(blob, filename);
        setDownloadModalOpen(false);

        if (passwordFromHeader) {
          message.success({
            content: (
              <div>
                <div>{t("backup_downloaded_successfully")}</div>
                <div
                  style={{
                    marginTop: 8,
                    fontWeight: "bold",
                    color: "#ff4d4f",
                  }}
                >
                  ZIP Password: {passwordFromHeader}
                </div>
                <div style={{ marginTop: 6 }}>
                  Use this password to extract the ZIP in Windows Explorer.
                </div>
              </div>
            ),
            duration: 15,
          });
        } else {
          message.success(t("backup_downloaded_successfully"));
        }
      }
    } catch (e) {
      console.error(e);
      message.error(t("backup_failed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= RESTORE ================= */
  const handleUpload = async () => {
    if (!fileList.length) {
      message.warning(t("select_file"));
      return;
    }

    if (!password) {
      message.warning(t("enter_password") || "Enter password");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileList[0]);
    formData.append("password", password);

    try {
      setLoading(true);
      let response;

      if (restoreType === "pg") {
        response = await AuthService.restorePg(formData);
      } else {
        response = await AuthService.restoreFromZip(formData);
      }

      message.success(
        response?.data?.message ||
          t("restore_success") ||
          "Backup restored successfully"
      );

      setUploadModalOpen(false);
      setFileList([]);
      setPassword("");
    } catch (e) {
      console.error(e);
      message.error(
        e?.response?.data?.message ||
          t("restore_failed") ||
          "Restore failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const backupSelect = (
    <Select
      value={backupType}
      onChange={setBackupType}
      style={{ width: "100%", marginBottom: 8 }}
      options={[
        { value: "csv", label: t("backup_type_csv") },
        { value: "pg", label: t("backup_type_pg") },
      ]}
    />
  );

  return (
    <>
      {compact ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Button
            type="primary"
            icon={loading ? <LoadingOutlined spin /> : <DownloadOutlined />}
            loading={loading}
            onClick={handleOpenDownloadModal}
            disabled={loading}
            block
            style={{ height: 40 }}
          >
            {t("backup")}
          </Button>

          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              if (onAction) {
                onAction();
              }
              setUploadModalOpen(true);
            }}
            block
            style={{ height: 40 }}
          >
            {t("upload_backup")}
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            whiteSpace: "nowrap",
          }}
        >
          <Button
            type="primary"
            icon={loading ? <LoadingOutlined spin /> : <DownloadOutlined />}
            loading={loading}
            onClick={handleOpenDownloadModal}
            disabled={loading}
            style={{ height: 48 }}
          >
            {t("backup")}
          </Button>

          <Button
            icon={<UploadOutlined />}
            onClick={() => setUploadModalOpen(true)}
            style={{ height: 48 }}
          >
            {t("upload_backup")}
          </Button>
        </div>
      )}

      <Modal
        title={t("backup")}
        open={downloadModalOpen}
        onOk={handleDownload}
        onCancel={() => setDownloadModalOpen(false)}
        confirmLoading={loading}
        okText={t("backup")}
        cancelText={t("cancel")}
      >
        {backupSelect}
      </Modal>

      <Modal
        title={t("upload_backup")}
        open={uploadModalOpen}
        onOk={handleUpload}
        onCancel={() => setUploadModalOpen(false)}
        confirmLoading={loading}
        okText={t("ok")}
        cancelText={t("cancel")}
        okType="danger"
      >
        {/* RESTORE TYPE SELECT */}
        <Select
          value={restoreType}
          onChange={(val) => {
            setRestoreType(val);
            setFileList([]);
            setPassword("");
          }}
          style={{ width: "100%", marginBottom: 16 }}
          options={[
            { value: "csv", label: t("restore_type_csv") },
            { value: "pg", label: t("restore_type_pg") },
          ]}
        />

        {/* ZIP FILE */}
        <Upload
          accept=".zip"
          beforeUpload={(file) => {
            const isZip =
              file.type === "application/zip" ||
              file.name.toLowerCase().endsWith(".zip");

            if (!isZip) {
              message.error(
                t("only_zip_allowed") ||
                  "Only .zip files are allowed"
              );
              return Upload.LIST_IGNORE;
            }

            setFileList([file]);
            return false;
          }}
          fileList={fileList}
          maxCount={1}
        >
          <Button icon={<UploadOutlined />}>
            {t("select_file")}
          </Button>
        </Upload>

        {/* PASSWORD */}
        <Input.Password
          style={{ marginTop: 16 }}
          placeholder={t("enter_password") || "Enter password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default NavBackup;
