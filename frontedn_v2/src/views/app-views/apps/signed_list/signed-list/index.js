import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Switch,
  message,
  Row,
  Col,
  Pagination,
} from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  PlusCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  LeftCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import AvatarStatus from "components/shared-components/AvatarStatus";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
// ...existing code...
import SignedListService from "services/SignedListService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const SignedList = () => {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const { t } = useTranslation();
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortedColumns, setSortedColumns] = useState([]);

  const handleTableChange = useCallback((pagination, filters, sorter) => {
    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const newSorted = sorters
      .filter(s => s.order)
      .map(s => ({ field: s.columnKey || s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
    setSortedColumns(newSorted);
    setPageNumber(1);
  }, []);

  const sortOrderMap = useMemo(() => {
    const map = {};
    sortedColumns.forEach((s) => {
      map[s.field] = s.order === 'ASC' ? 'ascend' : 'descend';
    });
    return map;
  }, [sortedColumns]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await SignedListService.getList(pageNumber, pageSize, search, "", sortedColumns);
      setList(res?.data?.records);
      setTotal(res?.data?.total_records);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, sortedColumns, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dropdownMenu = (row) => ({
    items: [
      {
        key: "edit-signed",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit_signed")}</span>
          </Flex>
        ),
        onClick: () => editSigned(row)
      },
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row)
      },
      {
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">
              {t("delete")}
            </span>
          </Flex>
        ),
        onClick: () => deleteRow(row)
      }
    ]
  });

  const addSigned = () => {
    navigate("/app/apps/signed-list/add-signed");
  };

  const editSigned = (row) => {
    navigate(`/app/apps/signed-list/edit-signed/${row.id}`);
  };

  const viewDetails = (row) => {
    navigate(`/app/apps/signed-list/info-signed/${row?.id}`);
  };

  const deleteRow = async (row) => {
    try {
      await SignedListService.deleteById(row.id);
      message.success(t("signed_deleted_successfully"));
      fetchData();
    } catch (error) {
      message.error(t("error_deleting_signed"));
    }
  };

  const handleStatusChange = async (checked, record) => {
    try {
      const res = await SignedListService.statusChange(
        record.id,
        checked ? "active" : "inactive"
      );
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
      title: t("full_name"),
      dataIndex: "fullName",
      key: "lastName",
      sorter: { multiple: 1 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['lastName'] || null,
      render: (_, record) => (
        <div className="d-flex">
          {record?.photo && record?.photo.includes("http") ? (
            <AvatarStatus
              src={record.photo}
              size={25}
              name={
                record.lastName +
                " " +
                record.firstName +
                " " +
                record.fatherName
              }
            />
          ) : (
            <AvatarStatus
              size={25}
              icon={<UserOutlined />}
              name={
                record.lastName +
                " " +
                record.firstName +
                " " +
                record.fatherName
              }
            />
          )}
        </div>
      ),
    },
    {
      title: t("workplace"),
      dataIndex: "workplace",
      key: "workplace",
      sorter: { multiple: 2 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['workplace'] || null,
    },
    {
      title: t("position"),
      dataIndex: "position",
      key: "position",
      sorter: { multiple: 3 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['position'] || null,
    },
    {
      title: t("rank"),
      dataIndex: "rank",
      key: "rank",
      sorter: { multiple: 4 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['rank'] || null,
      render: (rank) => (
        <div className="d-flex">
          <span>{rank ? rank : t("-")}</span>
        </div>
      ),
    },
    {
      title: t("status"),
      dataIndex: "status",
      key: "status",
      sorter: { multiple: 5 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['status'] || null,
      render: (text, record) => (
        <Switch
          checkedChildren={<CheckOutlined />}
          unCheckedChildren={<CloseOutlined />}
          checked={text === "active"}
          onChange={(checked) => handleStatusChange(checked, record)}
        />
      ),
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: "15%",
      sorter: { multiple: 6 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['createdAt'] || null,
    },
  ];

  const onSearch = (e) => {
    setPageNumber(1);
    setSearch(e.target.value);
  };

  const fromatFullName = (firstName, lastName, fatherName) => {
    if (!fatherName) {
      return lastName + " " + firstName;
    }
    const fullName = lastName + " " + firstName + " " + fatherName;
    if (fullName.length > 20) {
      return (
        lastName + " " + firstName + " " + fatherName.substring(0, 10) + "..."
      );
    }
    return fullName;
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
              autoFocus
              prefix={<SearchOutlined />}
              onChange={(e) => onSearch(e)}
            />
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="mb-3 d-flex gap-2">
            <Button
              onClick={addSigned}
              type="primary"
              icon={<PlusCircleOutlined />}
              className="mr-2"
            >
              {t("add_signed")}
            </Button>
            <Button onClick={backHandle} tabIndex={6}>
              <LeftCircleOutlined /> {t("back")}
            </Button>
          </div>
        </Flex>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            fullName: fromatFullName(
              elm?.last_name,
              elm?.first_name,
              elm?.father_name
            ),
            createdAt: getDateString(elm?.createdAt),
          }))}
          rowKey="id"
          loading={loading}
          onChange={handleTableChange}
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

export default SignedList;
