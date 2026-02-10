import React, { useEffect, useState } from "react";
import { Card, Table, Select } from "antd";
import Flex from "components/shared-components/Flex";
import utils from "utils";
import { getDateString } from "utils/aditionalFunctions";
import FormService from "services/FormService";
import { useTranslation } from "react-i18next";

const { Option } = Select;

const LogList = ({ id }) => {
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [field, setField] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const response = await FormService.getLogList(
          "Initiator",
          id,
          field,
          pageNumber,
          pageSize
        );

        setList(response?.data?.logs);
        setTotal(response?.data?.totalCount);
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [field, pageNumber, pageSize, id]);

  const categories = [
    { key: "first_name", label: t("first_name") },
    { key: "last_name", label: t("last_name") },
    { key: "father_name", label: t("father_name") },
  ];


  const tableColumns = [
    {
      title: t("field_name"),
      dataIndex: "fieldName",
      sorter: (a, b) => utils.antdTableSorter(a, b, "fieldName"),
    },
    {
      title: t("old_value"),
      dataIndex: "oldValue",
      sorter: (a, b) => utils.antdTableSorter(a, b, "oldValue"),
    },
    {
      title: t("new_value"),
      dataIndex: "newValue",
      sorter: (a, b) => utils.antdTableSorter(a, b, "newValue"),
    },
    {
      title: t("executed_by"),
      dataIndex: "executor",
      render: (_, elm) => (
        <div>
          {elm?.executor?.first_name ? elm?.executor?.first_name : ""}{" "}
          {elm?.executor?.last_name ? elm?.executor?.last_name : ""}
        </div>
      ),
      sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
      render: (createdAt) => <div>{getDateString(createdAt)}</div>,
    },
  ];
  const handleShowCategory = (value) => {
    if (value !== "all") {
      setField(value);
    } else {
      setField("");
    }
  };

  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          {/* <div className="mr-md-3 mb-3">
						<Input placeholder="Search" prefix={<SearchOutlined />} onChange={e => onSearch(e)}/>
					</div> */}
          <div className="mb-3">
            <Select
              defaultValue={t("all")}
              className="w-100"
              style={{ minWidth: 180 }}
              onChange={handleShowCategory}
              placeholder={t("category")}
            >
              <Option value="all">{t("all")}</Option>
              {categories.map((elm) => (
                <Option key={elm.key} value={elm.key}>
                  {elm.label}
                </Option>
              ))}
            </Select>
          </div>
        </Flex>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list}
          // rowKey='id'
          loading={loading}
          // rowSelection={{
          // 	selectedRowKeys: selectedRowKeys,
          // 	type: 'checkbox',
          // 	preserveSelectedRowKeys: false,
          // 	...rowSelection,
          // }}
          pagination={{
            current: pageNumber,
            pageSize: pageSize,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            total: total,
            onChange: (pageNumber, pageSize) => {
              setPageNumber(pageNumber);
              setPageSize(pageSize);
            },
          }}
        />
      </div>
    </Card>
  );
};

export default LogList;
