import React, { useEffect, useState } from "react";
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
import { ModelOptions } from "constants/CompleteStatus";
import StatisticsService from "services/StattisticsService";
import { useNavigate } from "react-router-dom";
const { Option } = Select;

const ReportByForm = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState({});
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [workplaceFetching, setWorkplaceFetching] = useState(false);

  const fetchWorkplaces = async (searchText) => {
    try {
      // Bu yerda haqiqiy API manzilini ko'rsating
      const response = await WorkPlaceService.listByRegistration(1, 15, searchText);
      return response?.data?.workplaces;
    } catch (error) {
      return [];
    }
  };

  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length >= 2) {
      setWorkplaceFetching(true);
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions(
        [{ value: "all", label: t("all") },
        ...data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      ]);
      setWorkplaceFetching(false);
    }
  }, 500);

  const showModal = () => {
    setIsModalVisible(true);
  };

  useEffect(() => {
    const fetchWorkplacesData = async () => {
      const data = await fetchWorkplaces("");
      setWorkplaceOptions([
        { value: "all", label: t("all") },
        ...data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      ]);
    };
    fetchWorkplacesData();
  }, [t]);

  const downloadReport = async () => {
    const workplaces = list?.map((item) => {
      return item?.name;
    });
    const response = await StatisticsService.statisticsByForm({
      workplaces: workplaces,
      startDate: search?.startDate,
      endDate: search?.endDate,
      form_reg_req: search?.form_reg_req,
    });
    if (response?.data?.code === 200) {
      message.success(t("report_downloaded_successfully"));
      const filename = "Сверка по ведомствам, по формам ";
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
    >
      {t("add")}
    </Button>
  );

  const handleDelete = (record) => {
    try {
      setList(prevList => prevList.filter(item => item.name !== record.name));
      message.success(t("deleted_successfully"));
    } catch (error) {
      message.error(t("error_deleting"));
    }
  };

  const tableColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
      render: (name) => {
        return name === "all" ? t("all") : name;
      }
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
    }
  ];

  const backHandle = () => {
    navigate(-1);
  };

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col span={24} style={{ display: "flex", justifyContent: "flex-end" }}>
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
              <ProviderComponent rolePermission={["admin", "user", "superAdmin"]}>
                {addButton}
              </ProviderComponent>
              <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
            </Flex>
          </Col>
          <Col span={24}>
            <h3>{t("report_by_form")}</h3>
          </Col>
          <Col xs={24} sm={24} md={12} lg={4}>
            <Form.Item name="date" label={null}>
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
            <Form.Item name="form_reg_req" label={null}>
              <Select
                className="w-100"
                placeholder={t("model_name")}
                required
                tabIndex={2}
                onChange={(value) => {
                  setSearch({ ...search, form_reg_req: value });
                }}
              >
                {ModelOptions.map((item) => (
                  <Option key={item?.label} value={item?.value}>
                    {item?.label}
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
                placeholder={t("workplace")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onSelect={(value) => {
                  if (!list.some(item => item.name === value)) {
                    setList((prev) => [...prev, { name: value }]);
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
            pagination={{
              current: pageNumber,
              pageSize: pageSize,
              // total: list.length,
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

export default ReportByForm;
