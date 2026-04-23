import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  message,
  Col,
  Row,
  Pagination
} from "antd";
import {
  EyeOutlined,
  PlusCircleOutlined,
  EditOutlined,
  UserAddOutlined,
  LeftCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
import utils from "utils";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import ProviderComponent from "providerComponent";
import { useTranslation } from "react-i18next";
import RaportTypesService from "services/RaportTypesService";
import { useSearchParams } from "react-router-dom";

const RaportList = () => {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await RaportTypesService.list(pageNumber, pageSize, "");
      setList(res?.data?.raportTypes);
      setTotal(res?.data?.total_raportTypes);
    } catch (error) {
      console.log("error", error);
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dropdownMenu = (row) => {
    const items = [
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
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editRaport(row)
      }
    ];

    // Add relative item conditionally
    if (row?.model_name === "УЧЕТНЫЕ КАРТОЧКИ 123") {
      items.push({
        key: "add-relative",
        label: (
          <Flex alignItems="center">
            <UserAddOutlined />
            <span className="ml-2">{t("add_new_relative")}</span>
          </Flex>
        ),
        onClick: () => addRelative(row)
      });
    }

    return { items };
  };

  const goToRaportTypes = () => {
    navigate("/app/raport-types/add-raport-type");
  };

  const editRaport = (row) => {
    if (redirect) {
      navigate(
        `/app/raport-types/edit-raport/${row.id}?oldRedirect=${redirect}&&redirect=/app/raport-types`
      );
    } else {
      navigate(`/app/raport-types/edit-raport/${row.id}?redirect=/app/raport-types`);
    }
  };

  const viewDetails = (row) => {
    navigate(
      `/app/raport_types/info-raport/${row.id}`
    );
  };

  const addRelative = (row) => {
    if (row?.model_name === "УЧЕТНЫЕ КАРТОЧКИ 123") {
      navigate(
        `/app/relative/add-relative/${row.id}?redirect=/app/register-list`
      );
    }
  };

  const backHandle = () => {
    navigate(-1);
  };
  const tableColumns = [
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: "100px",
      render: (_, elm) => (
        <div className="text-left">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
    // {
    //   title: t("number"),
    //   dataIndex: "regNumber",
    //   width: "4%",
    //   sorter: (a, b) => utils.antdTableSorter(a, b, "reg_number"),
    //   render: (_, __, index) => {
    //     const orderNumber = (pageNumber - 1) * pageSize + index + 1;
    //     return orderNumber;
    //   },
    // },
    {
      title: t("name"),
      dataIndex: "name",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
    },
    {
      title: t("organization"),
      dataIndex: "organization",
    },
    // {
    //   title: t("code"),
    //   dataIndex: "code",
    //   width: "15%",
    // },
    // {
    //   title: t("code_ru"),
    //   dataIndex: "code_ru",
    //   width: "15%",
    // },
    {
      title: t("executor"),
      dataIndex: "executor",
      render: (_, elm) => (
        <p
          style={{ cursor: "pointer" }}
          onClick={() =>
            navigate(`/app/apps/admin/info-admin/${elm?.executor?.id}`)
          }
        >
          {elm?.executor?.first_name ? elm?.executor?.first_name : ""}{" "}
          {elm?.executor?.last_name ? elm?.executor?.last_name : ""}
        </p>
      ),
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "updated_at"),
      width: "15%",
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    }

  ];


  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          <div className="mr-md-3 mb-3">
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="mb-3 d-flex gap-2">
            <ProviderComponent rolePermission={["admin", "user", "superAdmin"]}>
              {/* <Button
                onClick={() => { goToRaportTypes() }}
                type="primary"
                icon={<PlusCircleOutlined />}
                block
              >
                {t("add")}
              </Button> */}
              <Button className="ml-2" onClick={() => { backHandle() }}><LeftCircleOutlined />{t("back")}</Button>
            </ProviderComponent>
          </div>
        </Flex>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            birth_datev1: getDateDayString(elm?.birth_date),
          }))}
          rowKey="id"
          loading={loading}
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

export default RaportList;
