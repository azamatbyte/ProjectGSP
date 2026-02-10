import React, { useEffect, useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Button,
  Spin,
  message,
} from "antd";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { handleUpload } from "../../admin/AdminForm/GeneralField";
import RaportService from "services/RaportService";

const GeneralField = (props) => {
  const { setUploadedFile, form } = props;
  const [loading, setLoading] = useState(true);
  const { id } = useParams();
  const { t } = useTranslation();
  const [download, setDownload] = useState(null);

  useEffect(() => {
    const fetchAdminData = async (id) => {
      try {
        setLoading(true);
        const response = await RaportService.getByid(id);
        form.setFieldsValue({
          fullName: response?.data?.raports?.registration?.fullName,
          regNumber: response?.data?.raports?.registration?.regNumber,
          name: response?.data?.raports?.raport?.name,
        });
        setDownload(response?.data?.raports?.raport?.link);
        if (response.status !== 200) throw new Error("Failed to fetch data");
      } catch (error) {
        message.error(t("failed_to_load_admin_data"));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAdminData(id);
    }
  }, [id, form, t]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Spin size="large" />
      </div>
    );
  }

  const uploadProps = {
    name: "file",
    multiple: false,
    showUploadList: false,
    uploadedFile: null,
    uploadLoading: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const isUploaded = await handleUpload(file);
        if (isUploaded) {
          onSuccess(null, file);
          uploadProps.uploadedFile = isUploaded?.data?.link;
          uploadProps.uploadLoading = false;
          message.success("File uploaded successfully");
          setUploadedFile(isUploaded?.data?.link);
        } else {
          onError(new Error("Upload failed"));
          uploadProps.uploadLoading = false;
        }
      } catch (error) {
        onError(error);
        uploadProps.uploadLoading = false;
      }
    },
  };

  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="fullName" label={t("full_name")}>
                <Input className="w-100" readOnly tabIndex={1} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="regNumber" label="Reg Number" hasFeedback>
                <Input className="w-100" tabIndex={2} readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="name" label={t("name")}>
                <Input className="w-100" tabIndex={3} readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="download" label={t("download")}>
                <Button
                  className="w-100"
                  type="primary"
                  tabIndex={5}
                  onClick={() => window.open(download, "_blank")}
                >
                  {t("download")}
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

export default GeneralField;
