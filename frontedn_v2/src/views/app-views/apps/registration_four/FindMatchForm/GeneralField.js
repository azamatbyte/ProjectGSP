import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Tag,
  Form,
  Row,
  Col,
  Tooltip,
  message,
} from "antd";
import {
  EyeOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
import utils from "utils";
import { useTranslation } from "react-i18next";
import RegistrationFourService from "services/RegistartionFourService";
import { getDateDayString } from "utils/aditionalFunctions";

const GeneralField = (props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tableData, userInfo, id } = props;
  // const [searchParams] = useSearchParams();
  const [list, setList] = useState([]);
  // const [pageNumber, setPageNumber] = useState(searchParams.get("pageNumber") || 1);
  // const [pageSize, setPageSize] = useState(searchParams.get("pageSize") || 10);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (tableData) {
      setList(tableData);
      setTotal(tableData.length);
    }
  }, [tableData]);

  useEffect(() => {
    if (userInfo) {
      setList(userInfo);
      setTotal(userInfo.length);
    }
  }, [userInfo]);

  const dropdownMenu = (row) => ({
    items: [
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row)
      }
    ]
   });

  const viewDetails = (row) => {
    if (
      row?.model === "registration" ||
      row?.model === "registration4"
    ) {
      navigate(
        `/app/apps/register/info-register/${row.id}`
      );
    } else {
      navigate(
        `/app/apps/relative/info-relative/${row.id}`
      );
    }
  };

  const handleSave = async (record) => {
    try {
      const res = await RegistrationFourService.saveNewReg(id, record?.id);
      if (res?.data?.code === 200) {
        message.success(t("success"));
        navigate(-1);
      } else {
        message.error(t("error"));
      }
    } catch (error) {
      console.log("error", error);
      message.error(t("error"));
    }
  };

  const tableColumns = [
    {
      title: t("registration_number"),
      dataIndex: "regNumber",
      sorter: (a, b) => utils.antdTableSorter(a, b, "regNumber"),
      render: (regNumber) => (
        <Tooltip title={regNumber}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {regNumber?.length > 10
              ? "..." + regNumber.slice(regNumber.length - 10)
              : regNumber}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("similarity_percentage"),
      dataIndex: "similarity_percentage",
      sorter: (a, b) => utils.antdTableSorter(a, b, "similarity_percentage"),
      render: (similarity_percentage) => (
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {similarity_percentage}%
        </span>
      ),
    },
    {
      title: t("model"),
      dataIndex: "model",
      columnWidth: "150px",
      sorter: (a, b) => utils.antdTableSorter(a, b, "model"),
      render: (model) => (
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {model === "registration"
            ? t("registration")
            : model === "relative"
              ? t("relative")
              : model === "registration4"
                ? t("registration4")
                : model === "relativeWithoutAnalysis"
                  ? t("relativeWithoutAnalysis")
                  : model}
        </span>
      ),
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      width: "15%",
      sorter: (a, b) => utils.antdTableSorter(a, b, "fullName"),
      render: (fullName) => (
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fullName}
        </span>
      ),
    },
    {
      title: t("access_status"),
      dataIndex: "accessStatus",
      width: "7%",
      sorter: (a, b) => utils.antdTableSorter(a, b, "accessStatus"),
      render: (accessStatus, elm) => (
        <>
          {(accessStatus === "ДОПУСК" && accessStatus !== null) ||
            accessStatus?.toLowerCase()?.includes("снят") ? (
            <Tooltip title={accessStatus}>
              <Tag
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                color={
                  new Date(elm?.expired) < new Date()
                    ? "orange"
                    : accessStatus === "ДОПУСК" ||
                      accessStatus?.toLowerCase()?.includes("снят")
                      ? "green"
                      : "orange"
                }
              >
                {accessStatus?.length > 10
                  ? accessStatus?.slice(0, 10) + "..."
                  : accessStatus}
              </Tag>
            </Tooltip>
          ) : (
            <>
              {accessStatus === "ЗАКЛЮЧЕНИЕ" ||
                accessStatus === "ЗАКЛЮЧЕНИЕ" ? (
                <Tooltip title={accessStatus}>
                  <Tag color="blue">{t("in_progress")}</Tag>
                </Tooltip>
              ) : (
                <Tooltip title={accessStatus}>
                  <Tag
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    color="red"
                  >
                    {accessStatus?.length > 10
                      ? accessStatus?.slice(0, 10) + "..."
                      : accessStatus}
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      render: (birthDate, elm) => (
        <>{birthDate ? getDateDayString(birthDate) : elm?.birthYear}</>
      ),
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      sorter: (a, b) => utils.antdTableSorter(a, b, "birthPlace"),
      render: (birthPlace) => {
        const text = birthPlace || "";
        // If the text is longer than 10 characters, truncate it.
        const truncated = text.length > 10 ? text.slice(0, 10) + "..." : text;

        return (
          <Tooltip title={text}>
            <span
              style={{
                display: "inline-block",
                maxWidth: "200px", // Adjust as needed
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncated}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("work_place"),
      dataIndex: "workplace",
      sorter: (a, b) => utils.antdTableSorter(a, b, "workplace"),
      render: (workplace, elm) => {
        const fullText = `${workplace || ""} ${elm?.position || ""}`.trim();
        if (fullText.length > 7) {
          const truncatedText = fullText.slice(0, 7) + "...";
          return (

            <Tooltip title={fullText}>
              <span>{truncatedText}</span>
            </Tooltip>
          );
        }

        return <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "inline-block",
            maxWidth: "200px", // Adjust as needed
          }}
        >{workplace}</span>;

      },
    },
    {
      title: t("save"),
      render: (_, record) => (
        <Button
          type="primary"
          onClick={() => handleSave(record)}
        >
          {t("save")}
        </Button>
      )
    },
    {
      title: t("match"),
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="mr-md-3 mb-3">
        <Row gutter={12}>
          <Col xs={24} sm={24} md={5}>
            <Form.Item
              name="lastName"
              label={t("last_name")}
            >
              <Input className="w-100" tabIndex={2} readOnly={true} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={5}>
            <Form.Item
              name="firstName"
              label={t("first_name")}
            >
              <Input className="w-100" autoFocus readOnly={true} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={5}>
            <Form.Item
              name="fatherName"
              label={t("father_name")}
            >
              <Input className="w-100" tabIndex={3} readOnly={true} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={4}>
            <Form.Item name="birthYear" label={t("birth_date")}>
              <Input className="w-100" tabIndex={9} readOnly={true} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={5}>
            <Form.Item name="birthPlace" label={t("birth_place")}>
              <Input className="w-100" tabIndex={9} readOnly={true} />
            </Form.Item>
          </Col>
        </Row>
      </div>
      <div className="table-responsive">
        <Table
          tableProps={{
            footer: true
          }}
          columns={tableColumns}
          dataSource={list}
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
            <span style={{ fontWeight: "bold" }} onClick={() => console.log("list", list)}>
              {t("total_number_of_entries")}: {total}
            </span>
          </Col>
          <Col>
            {/* <Pagination
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
            /> */}
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default GeneralField;
