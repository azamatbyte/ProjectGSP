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
import AuthService from "services/AuthService";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import StatisticsService from "services/StattisticsService";
import FormService from "services/FormService";
import { useNavigate } from "react-router-dom";
import { values } from "lodash";

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
  const [list, setList] = useState([]);
  const [executorIdList, setExecutorIdList] = useState([]);
  const [search, setSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [executorOptions, setExecutorOptions] = useState([]);
  const [executorFetching, setExecutorFetching] = useState(false);
  const [formOptions, setFormOptions] = useState([]);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const executors = await fetchExecutors("");
      const forms = await fetchForms("");
      setExecutorOptions(
        [{ value: "all", label: t("all") },
        ...executors.map((item) => ({
          value: item.id,
          label: `${item.last_name} ${item.first_name}${item.father_name ? " " + item.father_name : ""
            }`.trim(),
        }))]
      );
      setFormOptions(
        forms.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
    } catch (error) {
      console.log("error", error);
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

  const fetchExecutors = async (searchText) => {
    try {
      const response = await AuthService.getList(1, 10, searchText, "active");
      return response?.data?.users;
    } catch (error) {
      return [];
    }
  };

  const debouncedFetchExecutors = debounce(async (searchText) => {
    if (searchText.length > 1) {
      setExecutorFetching(true);
      const data = await fetchExecutors(searchText);
      setExecutorOptions(
        [{ value: "all", label: t("all") },
        ...data.map((item) => ({
          value: item.id,
          label: `${item.last_name} ${item.first_name}${item.father_name ? " " + item.father_name : ""
            }`.trim(),
        }))]
      );
      setExecutorFetching(false);
    }
  }, 500);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const downloadReport = async () => {
    const response = await StatisticsService.weeeklyReport({
      forms: search?.forms,
      startDate: search?.startDate,
      endDate: search?.endDate,
      admins: executorIdList,
    });
    if (response?.data?.code === 200) {
      message.success(t("report_downloaded_successfully"));
      const filename = "Анализ работы операторов";
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
      onClick={showModal}
      type="primary"
      icon={<PlusCircleOutlined />}
      block
    >
      {t("add")}
    </Button>
  );

  const handleDelete = (record) => {
    setList((prevList) => prevList.filter((item) => item.name !== record?.name));
    setExecutorIdList((prevList) =>
      prevList.filter((item) => item !== record?.id)
    );
    message.success(t("deleted_successfully"));
  };

  const tableColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
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
              <ProviderComponent
                rolePermission={["admin", "user", "superAdmin"]}
              >
                {addButton}
              </ProviderComponent>
              <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
            </Flex>
          </Col>

          <Col span={24}>
            <h3>{t("analysis_operator")}</h3>
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
                // placeholder={t('select_form')}
                onChange={(value) => {
                  setSearch({ ...search, forms: value });
                }}
                tabIndex={2}
                autoFocus
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

        <Modal
          title={t("select_option")}
          open={isModalVisible}
          onOk={handleOk}
          onCancel={handleCancel}
        >
          <Col xs={24} sm={24} md={24}>
            <Form.Item name="workplace">
              <Select
                className="w-100"
                placeholder={t("select_operator")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(value, label) => {
                  if (
                    !list.some((item) => item.name === label?.label) ||
                    !executorIdList.includes(value)
                  ) {
                    setList((prev) => [...prev, { name: label?.label, id: value }]);
                    setExecutorIdList((prev) => [...prev, value]);
                  }
                }}
                onSearch={debouncedFetchExecutors}
                loading={executorFetching}
                filterOption={false}
                tabIndex={15}
                options={executorOptions}
              />
            </Form.Item>
          </Col>
        </Modal>
        {/* <p onClick={() => console.log("executorIdList", executorIdList)}>Saloooom Dunyo</p> */}
        <div className="table-responsive">
          <Table
            columns={tableColumns}
            dataSource={list}
            rowKey="name"
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

export default WeeklyAnalysisOperator;
