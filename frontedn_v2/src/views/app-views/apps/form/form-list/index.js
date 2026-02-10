import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Switch,
  message,
  Col,
  Row,
  Pagination
} from "antd";
import {
  SearchOutlined,
  PlusCircleOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  LeftCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
import utils from "utils";
import FormService from "services/FormService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const FormList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await FormService.getList(pageNumber, pageSize, search);
      setList(res?.data?.forms);
      setTotal(res?.data?.total_forms);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("no_data"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, t]);

  useEffect(() => {
    fetchData();
  }, [pageNumber, pageSize, search, fetchData]);

  const dropdownMenu = (row) => ({
    items: [
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editForm(row)
      }
    ]
  });

  const addForm = () => {
    navigate("/app/apps/form/add-form");
  };

  const editForm = (row) => {
    navigate(`/app/apps/form/edit-form/${row.id}`);
  };

  const handleStatusChange = async (checked, record) => {
    console.log(checked, record);
    try {
      const res = await FormService.statusChange(record.id, checked);
      if (res.status === 200) {
        message.success(t("status_updated_successfully"));
        fetchData();
      } else {
        message.error(t("error_updating_status"));
      }
    } catch (error) {
      message.error(t("error_updating_status"));
    }
  };

  const backHandle = () => {
    navigate(-1);
  };

  const tableColumns = [
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: "50px",
      render: (_, elm) => (
        <div className="text-right">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
    {
      title: t("name"),
      dataIndex: "name",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
    },
    {
      title: t("description"),
      dataIndex: "description",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "description"),
    },
    {
      title: t("status"),
      dataIndex: "status",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "status"),
      render: (text, record) => (
        <Switch
          // onClick={()=>{console.log(text);}}
          checkedChildren={<CheckOutlined />}
          unCheckedChildren={<CloseOutlined />}
          checked={text === true}
          onChange={(checked) => handleStatusChange(checked, record)}
        />
      ),
    },
    {
      title: t("length"),
      dataIndex: "length",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "length"),
    },
    {
      title: t("month"),
      dataIndex: "month",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "month"),
    },
    {
      title: t("type"),
      dataIndex: "type",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "type"),
      render: (text) => {
        return text === "registration" ? t("registration") : t("registration4");
      },

    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
    },

    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "updatedAt"),
    }
  ];

  const onSearch = (e) => {
    setPageNumber(1);
    setSearch(e.target.value);
  };

  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          <div className="mr-md-3 mb-3">
            <Input
              placeholder={t("search")}
              prefix={<SearchOutlined />}
              onChange={(e) => onSearch(e)}
            />
          </div>
        </Flex>
        <div className="mb-3 d-flex gap-2">
          <Button
            onClick={addForm}
            type="primary"
            icon={<PlusCircleOutlined />}
            block
          >
            {t("add")}
          </Button>
          <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
        </div>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            createdAt: getDateString(elm?.createdAt),
            updatedAt: getDateString(elm?.updatedAt),
          }))}
          rowKey="id"
          loading={loading}
          // rowSelection={{
          //   selectedRowKeys: selectedRowKeys,
          //   type: "checkbox",
          //   preserveSelectedRowKeys: false,
          //   ...rowSelection,
          // }}
          pagination={false}
        />
        <Row
          style={{
            marginTop: 16,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Col>
            <span style={{ fontWeight: "bold" }}>
              {t("total_number_of_entries")}: {total}
            </span>
          </Col>
          <Col>
            <Pagination
              current={pageNumber}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              onShowSizeChange={(current, size) => {
                setPageSize(size);
                setPageNumber(1);
              }}
              onChange={(page, pageSize) => {
                setPageNumber(page);
              }}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default FormList;
