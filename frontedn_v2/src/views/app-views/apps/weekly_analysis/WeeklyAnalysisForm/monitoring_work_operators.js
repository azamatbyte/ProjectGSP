import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Select,
  Button,
  message,
  Form,
  Row,
  Col,
} from "antd";
import {
  DownloadOutlined,
  LeftCircleOutlined,
} from "@ant-design/icons";
import Flex from "components/shared-components/Flex";
import DateRangeFilter from "components/shared-components/DateRangeFilter";
import { useTranslation } from "react-i18next";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import StatisticsService from "services/StattisticsService";
import FormService from "services/FormService";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
const { Option } = Select;

const fetchForms = async (searchText) => {
  try {
    const response = await FormService.listWithStatus(1, 8, searchText, "");
    return response?.data?.forms;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const WeeklyAnalysisOperator = () => {
  const { t } = useTranslation();
	const { user } = useSelector((state) => state.auth);
  const [search, setSearch] = useState({});
  const [formOptions, setFormOptions] = useState([]);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const forms = await fetchForms("");
      setFormOptions(
        forms.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
    } catch (error) {
      console.log("error", error);
      message.error(t("data_not_found"));
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const backHandle = () => {
    navigate(-1);
  };

  const downloadReport = async () => {
    try {
      const response = await StatisticsService.weeeklyReport({
        forms: search?.forms,
        startDate: search?.startDate,
        endDate: search?.endDate,
        admins: [user?.id],
      });

    if (response?.data?.code === 200) {
      message.success(t("report_downloaded_successfully"));
      const filename = "Отчет оператора";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
        message.error(t("report_download_failed"));
      }
    } catch (error) {
      console.log("error", error);
      message.error(t("access_denied"));
    }
  };

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col
            span={24}
            style={{ display: "flex", justifyContent: "flex-end" }}
          >
            <Flex align="center">
              <Button
                type="primary"
                style={{ marginRight: 10 }}
                onClick={() => {
                  downloadReport();
                }}
              >
                <DownloadOutlined />
                {t("export")}
              </Button>
              <Button className="mr-2" onClick={backHandle}><LeftCircleOutlined /> {t("back")}</Button>
            </Flex>
          </Col>
          <Col span={24}>
            <h3>{t("weekly_analysis_operator")}</h3>
          </Col>
          <Col xs={24} sm={24} md={12} lg={4}>
            <Form.Item name="regDate" label={null}>
              <DateRangeFilter
                picker="date"
                setState={setSearch}
                state={search}
                startKey="startDate"
                endKey="endDate"
                allowClear
                format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                placeholder={[t("register_date_start"), t("register_date_end")]}
                style={{ width: "100%" }}
                tabIndex={1}
                autoFocus
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={24} md={12} lg={4}>
            <Form.Item name="forms" label={null}>
              <Select
                mode="multiple"
                allowClear
                className="w-100"
                style={{ minWidth: 80 }}
                placeholder={t('select_form')}
                onChange={(value) => {
                  setSearch({ ...search, forms: value });
                }}
                tabIndex={2}
              >
                {formOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </>
  );
};

export default WeeklyAnalysisOperator;
