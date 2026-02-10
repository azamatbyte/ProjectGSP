import React, { useState } from "react";
import {
  Card,
  Select,
  Button,
  message,
  Modal
} from "antd";
import {
  LeftCircleOutlined,
  FileDoneOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const { Option } = Select;

const StatisticList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  const FormList = [
    { value: "report_by_departments", label: t("report_by_departments"), route: "/app/report-by-departments" },
    { value: "report_on_SP_forms", label: t("report_on_SP_forms"), route: "/app/report-on-SP-forms" },
    { value: "report_by_form", label: t("report_by_form"), route: "/app/report-by-form" },
    { value: "monitoring_work_operators", label: t("monitoring_work_operators"), route: "/app/monitoring-work-operators" },
    { value: "statistics_by_year", label: t("statistics_by_year"), route: "/app/statistics-by-year" },
    { value: "weekly_analysis_operator", label: t("weekly_analysis_operator"), route: "/app/weekly-analysis-operator" },
    // Add more forms with their routes as needed
  ];

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    if (selectedOption) {
      const selectedForm = FormList.find(form => form.value === selectedOption);
      if (selectedForm) {
        navigate(selectedForm.route);
        setIsModalVisible(false);
      }
    } else {
      message.warning(t("please_select_option"));
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedOption(null);
  };

  const backHandle = () => {
    navigate(-1);
  };

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "20vh"}}>
        <Button
          onClick={() => showModal()}
          type="primary"
          icon={<FileDoneOutlined style={{ fontSize: "3rem" }} />}
          size="large"
          style={{ width: "80px", height: "80px", display: "flex", justifyContent: "center", alignItems: "center" }}
        ></Button>
        <p style={{ fontSize: "1.2rem", fontWeight: "bold", textAlign: "center" }}>
          {t("select_report_type")}
        </p>
      </div>
      <Button
        onClick={() => backHandle()}
        type="default"
        icon={<LeftCircleOutlined />}
        style={{ position: "absolute", top: "10px", right: "10px" }}
      >
        {t("back")}
      </Button>

      <Modal
        title={t("select_option")}
        open={isModalVisible}
        onOk={() => handleOk()}
        onCancel={() => handleCancel()}
      >
        <Select
          style={{ width: "100%" }}
          placeholder={t("please_select_option")}
          onChange={(value) => setSelectedOption(value)}
          value={selectedOption}
        >
          {FormList.map(form => (
            <Option key={form.value} value={form.value}>
              {t(form.label)}
            </Option>
          ))}
        </Select>
      </Modal>
    </Card>
  );
};

export default StatisticList;
