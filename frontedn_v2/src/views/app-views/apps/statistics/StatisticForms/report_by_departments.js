import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Table,
  Select,
  Button,
  message,
  Form,
  Modal,
  Row,
  Col,
} from "antd";
import {
  PlusCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LeftCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import Flex from "components/shared-components/Flex";
import DateRangeFilter from "components/shared-components/DateRangeFilter";
import utils from "utils";
import debounce from "lodash/debounce";
import ProviderComponent from "providerComponent";
import { useTranslation } from "react-i18next";
import WorkPlaceService from "services/WorkPlaceService";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import StatisticsService from "services/StattisticsService";
import { useNavigate } from "react-router-dom";

const ReportByDepartments = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState({});
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [workplaceFetching, setWorkplaceFetching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const workplaces = await fetchWorkplaces("");
      setWorkplaceOptions([
        { value: "all", label: t("all") },
        ...workplaces.map((item) => ({
          value: item.name,
          label: item.name,
        })),
      ]);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchWorkplaces = async (searchText) => {
    try {
      // Bu yerda haqiqiy API manzilini ko'rsating
      const response = await WorkPlaceService.listByRegistration(
        1,
        15,
        searchText
      );
      return response?.data?.workplaces;
    } catch (error) {
      return [];
    }
  };
  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length >= 2) {
      setWorkplaceFetching(true);
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions([
        { value: "all", label: t("all") },
        ...data.map((item) => ({
          value: item.name,
          label: item.name,
        })),
      ]);
      setWorkplaceFetching(false);
    }
  }, 500);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const downloadReport = async () => {
    const workplaces = list?.map((item) => {
      return item?.name;
    });
    const response = await StatisticsService.reportStatements({
      workplaces: workplaces,
      startDate: search?.startDate,
      endDate: search?.endDate,
    });
    if (response?.data?.code === 200) {
      message.success(t("report_downloaded_successfully"));
      const filename = "Отчет ведомствам";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      message.error(t("report_download_failed"));
    }
  };

  const handleOk = () => {
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const addButton = (
    <Button
      onClick={() => showModal()}
      type="primary"
      icon={<PlusCircleOutlined />}
      block
      tabIndex={2}
    >
      {t("add")}
    </Button>
  );

  const handleDelete = (record) => {
    try {
      setList((prevList) =>
        prevList.filter((item) => item.name !== record.name)
      );
      message.success(t("deleted_successfully"));
    } catch (error) {
      message.error(t("error_deleting"));
    }
  };

  const backHandle = () => {
    navigate(-1);
  };

  const tableColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
      render: (_, record) => {
        if (record.name === "all") {
          return t("all");
        }
        return record.name;
      },
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: 120,
      render: (_, record) => (
        <Button
          onClick={() => handleDelete(record)}
          type="primary"
          danger
          icon={<DeleteOutlined />}
        >
          {t("delete")}
        </Button>
      ),
    },
  ];

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
                tabIndex={3}
              >
                <DownloadOutlined />
                {t("export")}
              </Button>
              <ProviderComponent
                rolePermission={["admin", "user", "superAdmin"]}
              >
                {addButton}
              </ProviderComponent>
              <Button className="ml-2" onClick={() => backHandle()} tabIndex={4}>
                <LeftCircleOutlined />
                {t("back")}
              </Button>
            </Flex>
          </Col>

          <Col span={24}>
            <h3>{t("report_by_departments")}</h3>
          </Col>

          <Col xs={24} sm={24} md={12} lg={4}>
            <Form.Item name="dateRange" label={null}>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"2\"]");
                    if (nextInput) nextInput.focus();
                  }
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Modal
          title={t("select_option")}
          open={isModalVisible}
          onOk={() => handleOk()}
          onCancel={() => handleCancel()}
        >
          <Col xs={24} sm={24} md={24}>
            <Form.Item name="workplace">
              <Select
                className="w-100"
                placeholder={t("workplace")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(_, label) => {
                  if (label?.value === "all") {
                    setList([{ name: "all" }]);
                    return;
                  }
                  if (!list.some((item) => item.name === label?.label)) {
                    setList((prev) => [...prev, { name: label?.label }]);
                  } else {
                    message.error(t("workplace_already_selected"));
                    return;
                  }
                }}
                onSearch={debouncedFetchWorkplaces}
                loading={workplaceFetching}
                filterOption={false}
                tabIndex={15}
                options={workplaceOptions}
              />
            </Form.Item>
          </Col>
        </Modal>

        <div className="table-responsive">
          <Table
            columns={tableColumns}
            dataSource={list}
            loading={loading}
            pagination={{
              current: pageNumber,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              onShowSizeChange: (current, size) => {
                setPageSize(size);
                setPageNumber(1);
              },
              onChange: (page, pageSize) => {
                setPageNumber(page);
              },
            }}
          />
        </div>
      </Card>
    </>
  );
};

export default ReportByDepartments;
