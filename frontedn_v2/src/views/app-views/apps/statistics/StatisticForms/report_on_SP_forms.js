import React, { useState } from "react";
import {
  Card,
  Button,
  message,
  Form,
  Row,
  Col,
} from "antd";
import { DownloadOutlined, LeftCircleOutlined } from "@ant-design/icons";
import Flex from "components/shared-components/Flex";
import DateRangeFilter from "components/shared-components/DateRangeFilter";
import { useTranslation } from "react-i18next";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import StatisticsService from "services/StattisticsService";
import { useNavigate } from "react-router-dom";
const ReportOnSPForms = () => {
  const [search, setSearch] = useState({});
  const { t } = useTranslation();
  const navigate = useNavigate();


  const downloadReport = async () => {
    const response = await StatisticsService.reportFromForm({
      startDate: search?.startDate,
      endDate: search?.endDate,
    });
    if (response?.data?.code === 200) {
      message.success(t("success"));
      const filename = "Отчет по формам СП";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      message.error(t("error"));
    }
  };

  const backHandle = () => {
    navigate(-1);
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
              <Button className="ml-2" onClick={() => backHandle()}><LeftCircleOutlined />{t("back")}</Button>
            </Flex>
          </Col>

          <Col span={24}>
            <h3>{t("report_on_SP_forms")}</h3>
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
        </Row>
      </Card>
    </>
  );
};

export default ReportOnSPForms;