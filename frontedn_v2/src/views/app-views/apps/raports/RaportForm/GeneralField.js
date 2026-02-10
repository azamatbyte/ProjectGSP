import React, { useEffect, useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Button,
  Spin,
  Upload,
  message,
  Modal,
  Select,
} from "antd";
import { CloudUploadOutlined, PlusOutlined, DeleteOutlined, ClearOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { handleUpload } from "../../admin/AdminForm/GeneralField";
import RaportService from "services/RaportService";

const GeneralField = (props) => {
  const { id } = useParams();
  const { setUploadedFile, form, setRaportId, setLinkId, relatives, setRelatives } = props;
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const [download, setDownload] = useState(null);
  const [type, setType] = useState("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [relativeOptions, setRelativeOptions] = useState([]);
  const [selectedRelative, setSelectedRelative] = useState(null);
  const [relativeNotes, setRelativeNotes] = useState("");
  const [relativeTextAreaValue, setRelativeTextAreaValue] = useState("");
  const [relativeFetching, setRelativeFetching] = useState(false);

  useEffect(() => {
    const fetchAdminData = async (id) => {
      try {
        setLoading(true);
        const response = await RaportService.getByid(id);

        form.setFieldsValue({
          fullName: response?.data?.raports?.registrations?.map((item) => item.fullName),
          regNumber: response?.data?.raports?.registrations?.map((item) => item.regNumber),
          name: response?.data?.raports?.raport?.name || "",
          notes: response?.data?.raports?.raport?.notes || "",
          compr_info: response?.data?.raports?.raport?.compr_info || "",
        });
        setType(response?.data?.raports?.raport?.name || "");
        setDownload(response?.data?.raports?.raport?.link);
        setRaportId(response?.data?.raports?.raport?.id);
        setLinkId(response?.data?.raports?.id);
        if (response.status !== 200) throw new Error("Failed to fetch data");
      } catch (error) {
        message.error(t("failed_to_load_data"));
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAdminData(id);
    }
  }, [id, form, t, setRaportId]);

  const fetchRelatives = async (searchText = "") => {
    try {
      setRelativeFetching(true);
      const response = await RaportService.searchRelativesByRaportId({
        id,
        search: searchText || "",
        limit: 5,
      });
      let relatives = [];

      // Backend response structure: { code, message, data: { allRelatives: {...}, count } }
      const payload = response?.data?.data || response?.data || {};

      if (payload?.allRelatives) {
        const allRelatives = payload.allRelatives;
        if (Array.isArray(allRelatives)) {
          relatives = allRelatives;
        } else if (typeof allRelatives === "object") {
          relatives = Object.values(allRelatives).filter(
            (item) => item && typeof item === "object" && item.id
          );
        }
      } else if (Array.isArray(payload?.relatives)) {
        relatives = payload.relatives;
      } else if (Array.isArray(payload)) {
        relatives = payload;
      }
      const options = relatives.map((relative) => ({
        value: relative.id,
        label: relative.fullName ||
          `${relative.firstName || ""} ${relative.lastName || ""} ${relative.fatherName || ""}`.trim() ||
          t("relative"),
      }));
      setRelativeOptions(options);
    } catch (error) {
      console.error("Error fetching relatives:", error);
      message.error(t("error_fetching_data_relatives"));
    } finally {
      setRelativeFetching(false);
    }
  };

  useEffect(() => {
    if (isModalVisible) {
      fetchRelatives("");
    }
  }, [isModalVisible]);

  const handleAddRelative = () => {
    setIsModalVisible(true);
    setSelectedRelative(null);
    setRelativeNotes("");
  };

  const handleModalOk = () => {
    if (!selectedRelative) {
      message.warning(t("please_select_option"));
      return;
    }
    const selectedRelativeLabel =
      relativeOptions.find((opt) => opt.value === selectedRelative)?.label || "";

    // Format: "name - note"
    const newEntry = `${selectedRelativeLabel}${
      relativeNotes ? ` - ${relativeNotes}` : ""
    }`;

    // Form ichidagi relative_info maydoniga yozamiz
    const prevValue = form.getFieldValue("relative_info") || "";
    const combinedValue = prevValue ? `${prevValue}\n${newEntry}` : newEntry;
    form.setFieldsValue({ relative_info: combinedValue });

    // Relatives massivini yangilaymiz: har bir id uchun bitta obyekt
    if (typeof setRelatives === "function") {
      setRelatives((prev = []) => {
        const filtered = prev.filter((item) => item.id !== selectedRelative);
        return [
          ...filtered,
          {
            id: selectedRelative,
            notes: relativeNotes || "",
          },
        ];
      });
    }

    // Agar keyinchalik state kerak bo'lsa, sync qilib qo'yamiz
    setRelativeTextAreaValue(combinedValue);
    setIsModalVisible(false);
    setSelectedRelative(null);
    setRelativeNotes("");
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setSelectedRelative(null);
    setRelativeNotes("");
  };

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
          message.success(t("file_uploaded_successfully"));
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
    <>
      <Modal
        title={t("add_relative")}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText={t("add")}
        cancelText={t("cancel")}
      >
        <Form layout="vertical">
          <Form.Item label={t("relative")} required>
            <Select
              placeholder={t("select_option")}
              value={selectedRelative}
              onChange={setSelectedRelative}
              loading={relativeFetching}
              showSearch
              optionFilterProp="label"
              filterOption={false}
              style={{ width: "100%" }}
              options={relativeOptions}
              onSearch={(value) => {
                fetchRelatives(value);
              }}
            />
          </Form.Item>
          <Form.Item label={t("notes")}>
            <Input.TextArea
              placeholder={t("notes")}
              rows={4}
              value={relativeNotes}
              onChange={(e) => setRelativeNotes(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
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
              <Form.Item name="regNumber" label={t("reg_number")} hasFeedback>
                <Input className="w-100" tabIndex={2} readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="name" label={t("name")}>
                <Input className="w-100" tabIndex={3} />
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
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="update" label={t("update")}>
                <Upload {...uploadProps} tabIndex={6}>
                  <Button icon={<CloudUploadOutlined />}>{t("upload")}</Button>
                </Upload>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Form.Item label={t("compr_info_raport")} name="compr_info">
                <Input.TextArea
                  placeholder={t("compr_info_raport")}
                  rows={4}
                  tabIndex={13}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      const saveButton = document.querySelector("[tabindex=\"14\"]");
                      if (saveButton) saveButton.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Form.Item label={t("relative_raport")} name="relative_info">
                <Input.TextArea
                  readOnly
                  placeholder={t("relative_raport")}
                  rows={4}
                />
              </Form.Item>
              <Form.Item style={{ textAlign: "right" }}>
                <Button
                  style={{ marginRight: 8 }}
                  onClick={() => {
                    form.setFieldsValue({ relative_info: "" });
                    setRelativeTextAreaValue("");
                    if (typeof setRelatives === "function") {
                      setRelatives([]);
                    }
                  }}
                >
                  <ClearOutlined style={{ marginRight: 4 }} />
                  {t("clear")}
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddRelative}
                >
                  {t("add")}
                </Button>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Form.Item label={t("notes")} name="notes">
                <Input.TextArea
                  placeholder={t("notes")}
                  rows={4}
                  tabIndex={7}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      const saveButton = document.querySelector("[tabindex=\"7\"]");
                      if (saveButton) saveButton.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
    </>
  );
};

export default GeneralField;
