import React, { useState } from "react";
import { Button, message, Modal, Upload, Input } from "antd";
import { useTranslation } from "react-i18next";
import {
  DownloadOutlined,
  LoadingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import AuthService from "services/AuthService";

export const NavBackup = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [password, setPassword] = useState("");

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

  const handleClick = async () => {
    try {
      setLoading(true);

      const response = await AuthService.backup({
        format: "csv",
        compress: true,
      });

      const passwordFromHeader =
        response.headers?.["x-backup-password"];
      const blob = response.data;

      if (blob instanceof Blob) {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-");

        downloadBlob(blob, `export_${timestamp}.zip`);

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
                  Password: {passwordFromHeader}
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

      await AuthService.restoreFromZip(formData);

      message.success(
        t("restore_success") || "Backup restored successfully"
      );

      setUploadModalOpen(false);
      setFileList([]);
      setPassword("");
    } catch (e) {
      console.error(e);
      message.error(t("restore_failed") || "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* BACKUP */}
      <Button
        type="primary"
        icon={loading ? <LoadingOutlined spin /> : <DownloadOutlined />}
        loading={loading}
        onClick={handleClick}
        disabled={loading}
        className="mr-2"
        style={{ marginTop: 12, height: 48 }}
      >
        {t("backup")}
      </Button>

      {/* RESTORE */}
      <Button
        icon={<UploadOutlined />}
        onClick={() => setUploadModalOpen(true)}
        style={{ marginTop: 12, height: 48 }}
      >
        {t("upload_backup")}
      </Button>

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
