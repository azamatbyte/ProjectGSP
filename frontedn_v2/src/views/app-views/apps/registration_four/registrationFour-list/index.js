import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import "./style.css";
import {
  Card,
  Table,
  Select,
  Input,
  Button,
  message,
  Upload,
  DatePicker,
  Pagination,
  Tag,
  Tooltip
} from "antd";
import {
  UploadOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusCircleOutlined,
  DownloadOutlined,
  LeftCircleOutlined,
  DeploymentUnitOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate, useLocation } from "react-router-dom";
// ...existing code...
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import WorkPlaceService from "services/WorkPlaceService";
import InitiatorService from "services/InitiatorService";
import { Form, Row, Col } from "antd";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import Modal from "antd/es/modal/Modal";
import RegistrationFourService from "services/RegistartionFourService";
import UploadService from "services/UploadService";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import debounce from "lodash/debounce";
import FormService from "services/FormService";
import { useSearchParams } from "react-router-dom";
import {
  uploadFailure,
  uploadStart,
  uploadSuccess,
} from "store/slices/uploadDataSlice";
import { SESSION_TYPES } from "utils/sessions";
import RegistrationService from "services/RegistrationService";
const { Option } = Select;

const parseLocalDate = (input) => {
  const parsed = dayjs(input, "DDMMYYYY", true).startOf("day");
  return parsed.isValid() ? parsed : null;
};

const statusMap = {
  accepted: "green",
  not_accepted: "red",
  not_checked: "orange",
};

const fetchWorkplaces = async (searchText) => {
  try {
    // Bu yerda haqiqiy API manzilini ko'rsating
    const response = await WorkPlaceService.getList(1, 5, searchText);

    return response?.data?.workplaces;
  } catch (error) {
    console.error("Error:", error);
    return [];
  }
};
const fetchInitiators = async (searchText) => {
  try {
    const response = await InitiatorService.getList(1, 5, searchText);
    return response?.data?.data?.map((item) => ({
      full_name: item?.first_name + " " + item?.last_name,
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchForms = async (searchText) => {
  try {
    const response = await FormService.listWithStatus(
      1,
      5,
      searchText,
      "registration4"
    );
    return response?.data?.forms;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

export const handleUpload = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await UploadService.postImage(formData);
    return response;
  } catch (error) {
    console.error("Image upload failed:", error);
    return false;
  }
};

const beforeUpload = (file, t) => {
  const isJpgOrPng =
    file.type ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!isJpgOrPng) {
    message.error(t("you_can_only_upload_excel_file"));
  }

  const isLt2M = file.size / 1024 / 1024 < 400;
  if (!isLt2M) {
    message.error(t("excel_file_must_smaller_than_400mb"));
  }

  return isJpgOrPng && isLt2M;
};

const Index = (props) => {
  const [searchParams] = useSearchParams();

  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [formContent, setFormContent] = useState({
    form_reg: "",
    regNumber: "",
  });
  const [total, setTotal] = useState(0);
  const { user } = useSelector((state) => state.auth);
  const searchParamsData = searchParams.get("search");
  const [pageNumber, setPageNumber] = useState(
    searchParams.get("pageNumber") || 1
  );
  const [pageSize, setPageSize] = useState(searchParams.get("pageSize") || 10);
  const [search, setSearch] = useState({
    id: user?.id,
    ...(JSON.parse(searchParamsData)
      ? JSON.parse(searchParamsData)
      : {
        pageNumber: 1,
        pageSize: 10,
      }),
  });

  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const [formManual] = Form.useForm();
  const { t, i18n } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [workplaceFetching, setWorkplaceFetching] = useState(false);
  const [initiatorOptions, setInitiatorOptions] = useState([]);
  const [initiatorFetching, setInitiatorFetching] = useState(false);

  const [uploadedFileName, setUploadedFileName] = useState("");
  const [formOptions, setFormOptions] = useState([]);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [birthPlaceSearchRef, setBirthPlaceSearchRef] = useState("");
  const [searchValue, setSearchValue] = useState("");

  const formRef = useRef(null);
  const manualModalFormRef = useRef(null);

  dayjs.extend(customParseFormat);
  dayjs.extend(utc);

  // Focus on reg_number input and set first form option when manual modal opens
  useEffect(() => {
    if (manualModalVisible) {
      // Birinchi form option ni avtomatik tanlash
      if (formOptions.length > 0) {
        formManual.setFieldsValue({ form_reg: formOptions[0].value });
      }

      const id = setTimeout(() => {
        // reg_number input maydonini active qilish
        const regNumberInput = document.querySelector("[tabindex=\"2\"]");
        if (regNumberInput) {
          regNumberInput.focus();
        }
      }, 300);
      return () => clearTimeout(id);
    }
  }, [manualModalVisible, formOptions, formManual]);

  useEffect(() => {
    if (modalVisible && formOptions.length > 0) {
      const lastOption = formOptions[formOptions.length - 1];
      form.setFieldsValue({ form_reg: lastOption.value });
      setFormContent({ ...formContent, form_reg: lastOption.value });
    }
  }, [modalVisible, formOptions, form, formContent]);

  const datePickerRef = useRef(null);

  useEffect(() => {
    if (modalVisible && datePickerRef.current) {
      // Kichik timeout kerak, modal render bo'lishini kutish uchun
      const id = setTimeout(() => {
        datePickerRef.current?.focus();
      }, 100);
      return () => clearTimeout(id);
    }
  }, [modalVisible]);

  const fileUploadProps = {
    name: "file",
    multiple: false,
    showUploadList: false,
    uploadedImg: null,
    uploadLoading: false,

    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const isUploaded = await handleUpload(file);
        if (isUploaded) {
          onSuccess(null, file);
          fileUploadProps.uploadedImg = isUploaded?.data?.link;
          setUploadedFileName(file?.name);
          fileUploadProps.uploadLoading = false;
          message.success(t("excel_file_uploaded_successfully"));
          form.setFieldsValue({ filePath: isUploaded?.data?.link });
        } else {
          onError(new Error(t("upload_failed")));
          fileUploadProps.uploadLoading = false;
        }
      } catch (error) {
        onError(error);
        fileUploadProps.uploadLoading = false;
      }
    },
  };

  const select_options = [
    {
      value: "all",
      label: t("all"),
    },
    {
      value: "accepted",
      label: t("access_granted"),
    },
    {
      value: "not_accepted",
      label: t("not_access"),
    },
    {
      value: "not_checked",
      label: t("checking"),
    },
  ];

  const found_status_options = [
    {
      value: "all",
      label: t("all"),
    },
    {
      value: "found",
      label: t("found"),
    },
    {
      value: "not_found",
      label: t("not_found"),
    },
  ];

  const updateSearchParams = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("pageNumber", search.pageNumber.toString());
    params.set("pageSize", search.pageSize.toString());
    params.set("search", JSON.stringify(search));
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [location.search, location.pathname, navigate, search]);

  useEffect(() => {
    const fetchInitialData = async () => {
      const [workplaces, initiators, forms] = await Promise.all([
        fetchWorkplaces(""),
        fetchInitiators(""),
        fetchForms(""),
      ]);

      setWorkplaceOptions(
        workplaces.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setFormOptions(
        forms.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
    };

    fetchInitialData();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await RegistrationFourService.getList(search, pageNumber, pageSize);

      // Wait for all async operations to complete
      const updatedData = await Promise.all(
        res?.data?.temporaryData?.map(async (item) => {
          if (item?.registration) {
            const registration = await RegistrationService.getProverka(
              item?.registration
            );
            item.registration_data = registration?.data?.data;
          }
          if (item?.registration_four) {
            const registrationFour = await RegistrationService.getProverka(
              item?.registration_four
            );
            item.registration_four_data = registrationFour?.data?.data;
          }
          return item;
        }) || []
      );
      setFormContent({
        form_reg: res?.data?.temporaryData[0]?.form_reg,
        regNumber: res?.data?.temporaryData[0]?.regNumber,
      });
      setList(updatedData);
      setTotal(res?.data?.total_data);
    } catch (error) {
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, pageNumber, pageSize]);

  useEffect(() => {
    updateSearchParams();
    fetchData();
  }, [updateSearchParams, fetchData]);

  const deleteRow = async (data) => {
    try {
      await RegistrationFourService.delete(data?.id);
    } catch (error) {
      message.error(t("error_deleting_data_relatives"));
    } finally {
      fetchData();
    }
  };

  const deletByFilter = async (data) => {
    try {
      await RegistrationFourService.deleteAllTemporaryDataByFilter(search);
    } catch (error) {
      message.error(t("error_deleting_data_relatives"));
    } finally {
      fetchData();
    }
  };

  const editRegisterFour = (row) => {
    navigate(`/app/apps/registration_four/edit-register-four/${row.id}`);
  };

  const findMatchedRow = (row) => {
    navigate(`/app/apps/registration_four/find-match/${row.id}`);
  };

  const migration = async (id) => {
    try {
      const res = await RegistrationFourService.migration(id);
      if (res?.data?.code === 200) {
        message.success(t("success"));
      } else {
        message.error(t("error"));
      }
    } catch (error) {
      console.log("error", error);
    } finally {
      fetchData();
    }
  };

  const backHandle = () => {
    navigate(-1);
  };

  const dropdownMenu = (row) => {
    const items = [];

    // Add find matched item conditionally
    if ((row?.registration_four_similarity?.length || 0) +
      (row?.registrationSimilarity?.length || 0) > 0) {
      items.push({
        key: "find-matched",
        label: (
          <Flex alignItems="center">
            <FileSearchOutlined />
            <span className="ml-2">{t("find_matched")}</span>
          </Flex>
        ),
        onClick: () => findMatchedRow(row)
      });
    }

    items.push(
      {
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">{t("delete")}</span>
          </Flex>
        ),
        onClick: () => deleteRow(row)
      },
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editRegisterFour(row)
      }
    );

    return { items };
  };

  const tableColumns = [
    {
      title: t("№"),
      dataIndex: "order",
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right d-flex justify-content-end">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      width: "10%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "fullName"),
      render: (fullName) => (
        <Tooltip title={fullName}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {fullName ? (
              fullName?.length > 50 ? (
                fullName?.slice(0, 50) + "..."
              ) : (
                fullName
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      // sorter: (a, b) => new Date(a.birthDate) - new Date(b.birthDate),
      render: (_, elm) => (
        <>
          {elm?.birthDate !== null &&
            elm?.birthDate !== "Неизвестно" &&
            elm?.birthDate
            ? getDateDayString(elm?.birthDate)
            : elm?.birthYear
              ? elm?.birthYear
              : ""}
        </>
      ),
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "birthPlace"),
    },
    {
      title: t("reg_number"),
      dataIndex: "regNumber",
      width: "2%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "regNumber"),
      render: (regNumber) => (
        <p style={{ textAlign: "center" }}>{regNumber ? regNumber : <></>}</p>
      ),
    },
    {
      title: t("status"),
      dataIndex: "status",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "status"),
      render: (status) => (
        <Tag color={statusMap[status]}>
          {select_options.find((option) => option.value === status)?.label}
        </Tag>
      ),
    },
    {
      title: t("registration"),
      dataIndex: "registration",
      width: "2%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "registration"),
      render: (registration) => {
        return registration ? (
          <Button
            onClick={() => {
              navigate(
                `/app/apps/register/info-register/${registration}?redirect=/app/registrationFour-list&&search=${JSON.stringify(
                  search
                )}`
              );
            }}
          >
            {t("open")}
          </Button>
        ) : (
          <p></p>
        );
      },
    },
    {
      title: t("access_status_registration"),
      dataIndex: "registration_data",
      width: "7%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "registration_data"),
      render: (registration_data) => (
        <>
          {(registration_data?.accessStatus === "ДОПУСК" &&
            registration_data?.accessStatus !== null) ||
            registration_data?.accessStatus?.toLowerCase()?.includes("снят") ? (
            <Tooltip title={registration_data?.accessStatus}>
              <Tag
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                color={
                  new Date(registration_data?.expired) < new Date()
                    ? "orange"
                    : registration_data?.accessStatus === "ДОПУСК" ||
                      registration_data?.accessStatus
                        ?.toLowerCase()
                        ?.includes("снят")
                      ? "green"
                      : "orange"
                }
              >
                {registration_data?.accessStatus?.length > 10
                  ? registration_data?.accessStatus?.slice(0, 10) + "..."
                  : registration_data?.accessStatus}
              </Tag>
            </Tooltip>
          ) : (
            <>
              {registration_data?.accessStatus === "ЗАКЛЮЧЕНИЕ" ||
                registration_data?.accessStatus === "ЗАКЛЮЧЕНИЕ" ? (
                <Tooltip title={registration_data?.accessStatus}>
                  <Tag color="blue">{t("in_progress")}</Tag>
                </Tooltip>
              ) : (
                <Tooltip title={registration_data?.accessStatus}>
                  <Tag
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    color="red"
                  >
                    {registration_data?.accessStatus?.length > 10
                      ? registration_data?.accessStatus?.slice(0, 10) + "..."
                      : registration_data?.accessStatus}
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: t("registration4"),
      dataIndex: "registration_four",
      width: "2%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "registration_four"),
      render: (registration4) => {
        return registration4 ? (
          <Button
            onClick={() => {
              navigate(
                `/app/apps/register/info-register/${registration4}?redirect=/app/registrationFour-list&&search=${JSON.stringify(
                  search
                )}`
              );
            }}
          >
            {t("open")}
          </Button>
        ) : (
          <p></p>
        );
      },
    },
    {
      title: t("access_status_four_registration"),
      dataIndex: "registration_four_data",
      width: "7%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "registration_four_data"),
      render: (registration_four_data) => (
        <>
          {(registration_four_data?.accessStatus === "ДОПУСК" &&
            registration_four_data?.accessStatus !== null) ||
            registration_four_data?.accessStatus
              ?.toLowerCase()
              ?.includes("снят") ? (
            <Tooltip title={registration_four_data?.accessStatus}>
              <Tag
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                color={
                  new Date(registration_four_data?.expired) < new Date()
                    ? "orange"
                    : registration_four_data?.accessStatus === "ДОПУСК" ||
                      registration_four_data?.accessStatus
                        ?.toLowerCase()
                        ?.includes("снят")
                      ? "green"
                      : "orange"
                }
              >
                {registration_four_data?.accessStatus?.length > 10
                  ? registration_four_data?.accessStatus?.slice(0, 10) + "..."
                  : registration_four_data?.accessStatus}
              </Tag>
            </Tooltip>
          ) : (
            <>
              {registration_four_data?.accessStatus === "ЗАКЛЮЧЕНИЕ" ||
                registration_four_data?.accessStatus === "ЗАКЛЮЧЕНИЕ" ? (
                <Tooltip title={registration_four_data?.accessStatus}>
                  <Tag color="blue">{t("in_progress")}</Tag>
                </Tooltip>
              ) : (
                <Tooltip title={registration_four_data?.accessStatus}>
                  <Tag
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    color="red"
                  >
                    {registration_four_data?.accessStatus?.length > 10
                      ? registration_four_data?.accessStatus?.slice(0, 10) +
                      "..."
                      : registration_four_data?.accessStatus}
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: t("found_status"),
      dataIndex: "found_status",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "found_status"),
      render: (found_status) => (
        <>{found_status ? t("found") : t("not_found")}</>
      ),
    },
    {
      title: t("number_found"),
      dataIndex: "number_found",
      render: (_, elm) => (
        <div className="text-center">
          {(elm?.registrationSimilarity?.length || 0) +
            (elm?.registration_four_similarity?.length || 0)}
        </div>
      ),
    },
    {
      title: t("migration"),
      dataIndex: "migration",
      render: (_, elm) => (
        <>
          {elm?.registration &&
            elm?.registration_four &&
            !elm?.migration_status ? (
            <Button type="primary" onClick={() => migration(elm?.id)}>
              {t("migration")}
            </Button>
          ) : (
            <></>
          )}
        </>
      ),
    },
    {
      title: t("work_place"),
      dataIndex: "workplace",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "workplace"),
      render: (workplace, elm) => {
        if (workplace) {
          if (elm?.position) {
            return elm?.workplace + ", " + elm?.position;
          }
          return elm?.workplace;
        } else if (elm?.position) {
          return elm?.position;
        }
        return "-";
      },
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "residence"),
      render: (residence) => (
        <p>
          {residence?.length > 100
            ? residence.slice(0, 100) + "..."
            : residence}
        </p>
      ),
    },
    {
      title: t("initiator"),
      dataIndex: "initiator",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "initiator"),
      render: (_, elm) => {
        return (
          <p
            onClick={() => {
              navigate(
                `/app/apps/initiator/info-initiator/${elm?.Initiator?.id}?redirect=/app/apps/register/register-list&&search=${search}`
              );
            }}
          >
            {elm?.Initiator?.last_name + " " + elm?.Initiator?.first_name}
          </p>
        );
      },
    },
    {
      title: t("executor"),
      dataIndex: "executor",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
      render: (_, elm) => {
        return (
          <p>{elm?.executor?.last_name + " " + elm?.executor?.first_name}</p>
        );
      },
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    },
  ];

  const handleAddData = async () => {
    // try {
    setLoadingExcel(true);
    form.validateFields().then(async (values) => {
      // setModalVisible(false);
      dispatch(uploadStart());
      const payload = {
        ...values,
        regDate: values?.regDate
          ? dayjs(values.regDate).utc().startOf("day").toISOString()
          : null,
      };
      // const result = await uploadData(values);
      // console.log("result", result);
      // if(result.status === 200){
      //   message.success("Data uploaded successfully");
      //   form.resetFields();
      // }
      RegistrationFourService.create(payload)
        .then((uploadData) => {
          if (uploadData?.status === 200) {
            dispatch(uploadSuccess());
            message.success(t("data_uploaded_successfully"));
            fetchData();
            setLoadingExcel(false);
            setModalVisible(false);
            form.resetFields();
          }
        })
        .catch((error) => {
          dispatch(uploadFailure());
          message.error(t("error_fetching_data_relatives"));
          fetchData();
          setLoadingExcel(false);
        });
    });
    // } catch (error) {
    //   console.log("errordata", error);
    //   message.error("error_fetching_data_relatives");
    // } finally {
    //   fetchData();
    //   setLoadingExcel(false);
    // }
  };

  const exportExcel = async () => {
    try {
      const response = await RegistrationFourService.exportSverka({
        executorId: user?.id,
        ...search,
      });
      if (response?.status === 200) {
        const a = document.createElement("a");
        a.href = (
          response?.data?.link +
          "?newFileName=Сверка_4-У" +
          `${user?.first_name ? user?.first_name : ""} ${user?.last_name ? user?.last_name : ""
          }`
        ).trim();
        a.setAttribute("download", "Сверка_4-У.xlsx");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.log("error", error);
    }
  };

  const deployData = async (type) => {
    if (list.length === 0) {
      message.error(t("no_data"));
      return;
    }

    try {
      const response = await RegistrationFourService.deployData({
        id: user?.id,
        type,
        form_reg: formContent.form_reg,
        regNumber: formContent.regNumber,
      });

      if (response?.data?.code === 200) {
        message.success(t("data_deployed_successfully"));
        message.success(`${t("total")} ${response?.data?.ids?.length}`);
        fetchData();
      } else {
        message.error(t("error"));
      }
    } catch (error) {
      setDeployLoading(false);
      if (error?.response?.data?.code !== 404) {
        message.error(error?.response?.data?.message || t("error"));
      }
    }
  };
  const normFile = (e) => {
  };

  const handleAddDataManual = async () => {
    formManual.validateFields().then(async (values) => {
      dispatch(uploadStart());
      const payload = {
        ...values,
        regDate: values?.regDate
          ? dayjs(values.regDate).utc().startOf("day").toISOString()
          : null,
      };
      RegistrationFourService.createManual(payload)
        .then((uploadData) => {
          if (uploadData?.status === 200) {
            dispatch(uploadSuccess());
            message.success(t("data_uploaded_successfully"));
            fetchData();
            setManualModalVisible(false);
          }
        })
        .catch((error) => {
          dispatch(uploadFailure());
          message.error(t("error_fetching_data_relatives"));
          fetchData();
        });
    });
  };

  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length > 2) {
      setWorkplaceFetching(true);
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setWorkplaceFetching(false);
    }
  }, 500);

  const debouncedFetchInitiators = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setInitiatorFetching(true);
      const initiators = await fetchInitiators(searchText);
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setInitiatorFetching(false);
    }
  }, 500);

  const regions = [
    { uz: "Андижон вилояти", ru: "Андижанская область" },
    { uz: "Бухоро вилояти", ru: "Бухарская область" },
    { uz: "Фарғона вилояти", ru: "Ферганская область" },
    { uz: "Жиззах вилояти", ru: "Джизакская область" },
    { uz: "Наманган вилояти", ru: "Наманганская область" },
    { uz: "Навои вилояти", ru: "Навоийская область" },
    { uz: "Қашқадарё вилояти", ru: "Кашкадарьинская область" },
    { uz: "Самарқанд вилояти", ru: "Самаркандская область" },
    { uz: "Сирдарё вилояти", ru: "Сырдарьинская область" },
    { uz: "Сурхандарё вилояти", ru: "Сурхандарьинская область" },
    { uz: "Тошкент вилояти", ru: "Ташкентская область" },
    { uz: "Тошкент шаҳри", ru: "г. Ташкент" },
    { uz: "Хоразм вилояти", ru: "Хорезмская область" },
    { uz: "Қорақалпоғистон республикаси", ru: "Каракалпакстанская республика" },
  ];

  const lang = i18n.language; // 'uz' yoki 'ru'
  const regionOptions = regions.map((r) => ({
    value: lang === "ru" ? r.ru : r.uz,
    label: lang === "ru" ? r.ru : r.uz,
  }));
  const birthPlaceOptions = useMemo(() => {
    const currentTyped = (searchValue || formContent.birthPlace || "").trim();
    if (currentTyped && !regionOptions.some((o) => o.value === currentTyped)) {
      return [
        {
          value: currentTyped,
          label: currentTyped,
          // className: "custom-typed-option" // Kiritilgan matn uchun maxsus class
        },
        ...regionOptions
      ];
    }
    return regionOptions;
  }, [regionOptions, formContent.birthPlace, searchValue]);



  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        {/* Left side - Sverka button */}
        <div>
          <Button
            type="primary"
            onClick={() => exportExcel()}
            icon={<DownloadOutlined />}
            style={{ minWidth: "120px" }}
          >
            {t("sverka")}
          </Button>
        </div>

        {/* Right side - All other buttons */}
        <div>
          <Row gutter={[16, 16]} justify="end">
            <Col>
              <Button
                type="primary"
                icon={<DeploymentUnitOutlined />}
                onClick={() => setDeployModalVisible(true)}
                loading={deployLoading}
                disabled={deployLoading}
                style={{ minWidth: "120px" }}
              >
                {t("deploy_data")}
              </Button>
            </Col>

            <Col>
              <Button
                type="primary"
                onClick={() => setManualModalVisible(true)}
                icon={<PlusCircleOutlined />}
                style={{ minWidth: "120px" }}
              >
                {t("add_manual")}
              </Button>
            </Col>

            <Col>
              <Button
                type="primary"
                onClick={() => setModalVisible(true)}
                icon={<PlusCircleOutlined />}
                style={{ minWidth: "120px" }}
              >
                {t("import_list")}
              </Button>
            </Col>

            <Col>
              <Button
                onClick={() => backHandle()}
                icon={<LeftCircleOutlined />}
                style={{ minWidth: "120px" }}
              >
                {t("back")}
              </Button>
            </Col>
          </Row>
        </div>
      </div>
      <Form
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={24} md={8} lg={6}>
            <Form.Item name="status" label={null}>
              <Select
                placeholder={t("select_option_temporary")}
                allowClear
                defaultValue={search?.status}
                onChange={(value) => {
                  value !== "all"
                    ? setSearch({ ...search, status: value })
                    : setSearch({ ...search, status: null });
                }}
              >
                {select_options.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={8} lg={6}>
            <Form.Item name="found_status" label={null}>
              <Select
                placeholder={t("found_status")}
                allowClear
                defaultValue={search?.found_status}
                onChange={(value) => {
                  value !== "all"
                    ? setSearch({ ...search, found_status: value })
                    : setSearch({ ...search, found_status: null });
                }}
              >
                {found_status_options.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={8} lg={6} className="clear-button-container">
            {/* <Form.Item name="clear" label={null}>
              <Button
                type="primary"
                onClick={() => {
                  setSearch({ ...search, status: null, found_status: null });
                  form.resetFields();
                }}
              >
                <ClearOutlined />
                {t("cleaddr_filter")}
              </Button>
            </Form.Item> */}
          </Col>
          <Col
            xs={24}
            sm={24}
            md={8}
            lg={6}
            style={{ display: "flex", justifyContent: "flex-end" }}
          >
            <Form.Item name="clear" label={null}>
              <Button
                type="default"
                danger
                onClick={() => {
                  deletByFilter();
                }}
              >
                <DeleteOutlined />
                {t("delete")}
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Modal
        title={t("add_data")}
        open={modalVisible}
        confirmLoading={loadingExcel}
        onCancel={() => setModalVisible(false)}
        onOk={() => {
          handleAddData();
        }}
        okButtonProps={{ tabIndex: 8 }}
        cancelButtonProps={{ tabIndex: 9 }}
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            name="form_reg"
            label={t("form")}
            rules={[{ required: true, message: t("please_enter_form") }]}
          >
            <Select
              className="w-100"
              style={{ minWidth: 80 }}
              onChange={(value) => {
                form.setFieldsValue({ form_reg: value });
                setFormContent({ ...formContent, form_reg: value });
              }}
              tabIndex={1}
            >
              {formOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="regDate"
            label={t("reg_date")}
            initialValue={dayjs()}
            rules={[{ required: true, message: t("please_enter_reg_date") }]}
          >
            <DatePicker
              ref={datePickerRef}
              format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
              className="w-100"
              tabIndex={2}
              onBlur={(e) => {
                const input = e.target.value;
                if (/^\d{8}$/.test(input)) {
                  const parsed = dayjs(input, "DDMMYYYY", true);
                  if (parsed.isValid()) {
                    // Use the correct form reference
                    form.setFieldsValue({ regDate: parsed });
                    // Update the input display to show formatted date
                    e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Tab") {
                  const input = e.target.value;
                  if (/^\d{8}$/.test(input)) {
                    const parsed = dayjs(input, "DDMMYYYY", true);
                    if (parsed.isValid()) {
                      // Use the correct form reference
                      form.setFieldsValue({ regDate: parsed });
                      // Update the input display to show formatted date
                      e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                    }
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = document.querySelector("[tabindex=\"3\"]");
                    if (nextInput) nextInput.focus();
                  }
                }
              }}
              onInputKeyDown={(e) => {
                const input = e.target;
                const value = input.value.replace(/\D/g, ''); // Remove non-digits

                // Auto-format as user types
                if (e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== "Tab") {
                  const digits = value.slice(0, 8);
                  const len = digits.length;
                  const day = digits.slice(0, 2);
                  const month = digits.slice(2, 4);
                  const year = digits.slice(4, 8);

                  let masked = "";
                  if (len <= 2) {
                    masked = day + (len === 2 ? "." : "");
                  } else if (len <= 4) {
                    masked = day + "." + month + (len === 4 ? "." : "");
                  } else {
                    masked = day + "." + month + "." + year;
                  }

                  if (input.value !== masked) {
                    setTimeout(() => {
                      input.value = masked;
                      const pos = masked.length;
                      try {
                        input.setSelectionRange(pos, pos);
                      } catch (_) { }
                    }, 0);
                  }
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label={t("reg_number")}
            name="regNumber"
            rules={[{ required: true, message: t("please_enter_reg_number") }]}
          >
            <Input placeholder={t("reg_number")} tabIndex={3} />
          </Form.Item>
          <Form.Item
            name="workplace"
            label={t("workplace")}
            rules={[{ required: true, message: t("please_enter_workplace") }]}
          >
            {/* <Select
              className="w-100"
              placeholder={t("workplace")}
              showSearch
              style={{ width: 200, cursor: "pointer" }}
              optionFilterProp="children"
              onChange={(value) => {
                form.setFieldsValue({ workplace: value });
              }}
              onSearch={(searchText) => {
                if (searchText.length === 0) {
                  // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
                  fetchWorkplaces("").then((data) => {
                    setWorkplaceOptions(
                      data.map((item) => ({
                        value: item.name,
                        label: item.name,
                      }))
                    );
                  });
                } else {
                  debouncedFetchWorkplaces(searchText);
                }
              }}
              loading={workplaceFetching}
              filterOption={false}
              tabIndex={4}
              options={workplaceOptions}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const nextInput = document.querySelector("[tabindex=\"5\"]");
                  if (nextInput) nextInput.focus();
                }
              }}
            /> */}
            <Input
              placeholder={t("workplace")}
              tabIndex={4}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const nextInput = document.querySelector("[tabindex=\"5\"]");
                  if (nextInput) nextInput.focus();
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="or_tab"
            label={t("initiator")}
            rules={[{ required: true, message: t("please_enter_initiator") }]}
          >
            <Select
              showSearch
              className="w-100"
              // placeholder={t('select_initiator')}
              style={{ width: 200, cursor: "pointer" }}
              optionFilterProp="children"
              onChange={(value, option) => {
                form.setFieldsValue({
                  or_tab: value,
                });
              }}
              onSearch={debouncedFetchInitiators}
              loading={initiatorFetching}
              filterOption={false}
              options={initiatorOptions}
              tabIndex={5}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const nextInput = document.querySelector("[tabindex=\"6\"]");
                  if (nextInput) nextInput.focus();
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label={t("record_list_manual")}
            name="recordNumber"
          >
            <Input
              placeholder={t("record_list_manual")}
              tabIndex={6}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const nextInput = document.querySelector("[tabindex=\"7\"]");
                  if (nextInput) nextInput.focus();
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label={t("file")}
            name="filePath"
            valuePropName="fileList"
            getValueFromEvent={normFile}
            rules={[{ required: true, message: t("please_upload_file") }]}
          >
            <Upload
              {...fileUploadProps}
              beforeUpload={(file) => beforeUpload(file, t)}
              name="filePath"
              action="/upload.do"
              listType="text"
            >
              <Button icon={<UploadOutlined />} tabIndex={7}>{t("upload_file")}</Button>
            </Upload>
            {uploadedFileName && (
              <div style={{ marginTop: "10px" }}>{uploadedFileName}</div>
            )}
          </Form.Item>
          <Form.Item label={t("notes")} name="notes">
            <Input.TextArea placeholder={t("notes")} rows={4} tabIndex={8} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={deployModalVisible}
        title={t("are_you_sure_deploy_data")}
        onCancel={() => setDeployModalVisible(false)}
        footer={[
          <Button
            key="main"
            type="primary"
            onClick={() => {
              deployData(SESSION_TYPES.SESSION);
              setDeployModalVisible(false);
            }}
          >
            {t("save_to_main")}
          </Button>,
          <Button
            key="backup"
            type="primary"
            onClick={() => {
              deployData(SESSION_TYPES.RESERVE);
              setDeployModalVisible(false);
            }}
          >
            {t("save_to_backup")}
          </Button>,
          <Button
            key="conclusion"
            type="primary"
            onClick={() => {
              deployData(SESSION_TYPES.RAPORT);
              setDeployModalVisible(false);
            }}
          >
            {t("conclusion")}
          </Button>,
          <Button key="cancel" onClick={() => setDeployModalVisible(false)}>
            {t("cancel")}
          </Button>,
        ]}
      ></Modal>
      <Modal
        title={t("add_manual")}
        open={manualModalVisible}
        onCancel={() => setManualModalVisible(false)}
        onOk={() => handleAddDataManual()}
        width={1200}
        ref={manualModalFormRef}
        footer={[
          <Button key="cancel" onClick={() => setManualModalVisible(false)} tabIndex={15}>
            {t("cancel")}
          </Button>,
          <Button key="submit" type="primary" onClick={() => handleAddDataManual()} tabIndex={14}>
            {t("save")}
          </Button>,
        ]}
      >
        <Form layout="vertical" form={formManual}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item
                name="form_reg"
                label={t("form")}
                rules={[{ required: true, message: t("please_enter_form") }]}
                maxLength={255}
              >
                <Select
                  className="w-100"
                  style={{ minWidth: 80 }}
                  onChange={(value) => {
                    formManual.setFieldsValue({ form_reg: value });
                  }}
                  ref={formRef}
                  tabIndex={1}
                  onSelect={() => {
                    setTimeout(() => {
                      const nextInput = document.querySelector("[tabindex=\"2\"]");
                      if (nextInput) nextInput.focus();
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"2\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                >
                  {formOptions.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            {/* <Col xs={24} sm={12} md={5}>
              <Form.Item name="formtype" label={t("form_type")}>
                <Input
                  className="w-100"
                  style={{ minWidth: 50 }}
                  tabIndex={2}
                  readOnly
                />
              </Form.Item>
            </Col> */}
            <Col xs={24} sm={12} md={4}>
              <Form.Item
                label={t("reg_number")}
                name="regNumber"
                rules={[
                  { required: true, message: t("please_enter_reg_number") },
                ]}
              >
                <Input
                  className="w-100"
                  style={{ minWidth: 80 }}
                  value={formContent.regNumber}
                  tabIndex={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"3\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="regDate"
                label={t("reg_date")}
                rules={[
                  { required: true, message: t("please_enter_reg_date") },
                ]}
              >
                <DatePicker
                  format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                  className="w-100"
                  tabIndex={3}
                  onBlur={(e) => {
                    const input = e.target.value;
                    const cleanValue = input.replace(/\D/g, "");
                    if (/^\d{8}$/.test(cleanValue)) {
                      const parsed = dayjs.utc(cleanValue, "DDMMYYYY", true);
                      if (parsed.isValid()) {
                        // Use the correct form reference
                        formManual.setFieldsValue({ regDate: parsed });
                        // Update the input display to show formatted date
                        e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Tab") {
                      const input = e.target.value;
                      const cleanValue = input.replace(/\D/g, "");
                      if (/^\d{8}$/.test(cleanValue)) {
                        const parsed = dayjs.utc(cleanValue, "DDMMYYYY", true);
                        if (parsed.isValid()) {
                          // Use the correct form reference
                          formManual.setFieldsValue({ regDate: parsed });
                          // Update the input display to show formatted date
                          e.target.value = parsed.format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT);
                        }
                      }

                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextInput = document.querySelector("[tabindex=\"4\"]");
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}

                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="or_tab"
                label={t("initiator")}
                rules={[
                  { required: true, message: t("please_enter_initiator") },
                ]}
              >
                <Select
                  showSearch
                  className="w-100"
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  onChange={(value, option) => {
                    form.setFieldsValue({
                      or_tab: value,
                    });
                  }}
                  onSearch={debouncedFetchInitiators}
                  loading={initiatorFetching}
                  filterOption={false}
                  options={initiatorOptions}
                  tabIndex={4}
                  onSelect={() => {
                    setTimeout(() => {
                      const nextInput = document.querySelector("[tabindex=\"5\"]");
                      if (nextInput) nextInput.focus();
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"5\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={8} lg={8}>
              <Form.Item
                label={t("last_name")}
                name="lastName"
                rules={[
                  { required: true, message: t("please_enter_last_name") },
                ]}
              >
                <Input
                  placeholder={t("last_name")}
                  tabIndex={5}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"6\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8}>
              <Form.Item
                label={t("first_name")}
                name="firstName"
                rules={[
                  { required: true, message: t("please_enter_first_name") },
                ]}
              >
                <Input
                  placeholder={t("first_name")}
                  tabIndex={6}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"7\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8}>
              <Form.Item
                label={t("father_name")}
                name="fatherName"

              >
                <Input
                  placeholder={t("father_name")}
                  tabIndex={7}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"8\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="birthYear"
                label={t("birth_year")}
                rules={[
                  { required: true },
                  {
                    validator: (_, value) => {
                      if (!value) {
                        return Promise
                          .reject
                          // new Error(t("enter_birth_year"))
                          ();
                      }
                      const year = parseInt(value, 10);
                      const currentYear = new Date().getFullYear();

                      if (isNaN(year) || year <= 0) {
                        return Promise.reject(
                          new Error(t("please_enter_valid_positive_year"))
                        );
                      }

                      if (year < 1900) {
                        return Promise.reject(
                          new Error(t("year_must_be_after_1900"))
                        );
                      }

                      if (year > currentYear) {
                        return Promise.reject(
                          new Error(t("year_cannot_be_future"))
                        );
                      }

                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder={t("enter_birth_year")}
                  className="w-100"
                  tabIndex={7}
                  onKeyPress={(e) => {
                    // Only allow digits
                    if (!/[0-9]/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    // Remove any non-digit characters
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    e.target.value = value;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"8\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("birth_place")}
                name="birthPlace"
              // rules={[
              //   { required: true, message: t("please_enter_birth_place") },
              // ]}
              >
                <Select
                  className="w-100"
                  placeholder={t("birth_place")}
                  showSearch
                  allowClear
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  value={formContent.birthPlace}
                  onSearch={(val) => {
                    const typed = (val || "").trim();
                    setBirthPlaceSearchRef(typed);
                    setSearchValue(typed);
                    // Qidiruv natijalarini yangilash uchun dropdown'ni qayta render qilamiz
                    // Bu dropdown'da kiritilgan matn va uning ostida mos keluvchi variantlarni ko'rsatadi
                  }}
                  filterOption={(input, option) => {
                    const inputValue = (input || "").toLowerCase();
                    const optionValue = (option?.label ?? option?.value ?? "").toLowerCase();

                    // Agar bu kiritilgan matn bo'lsa, har doim ko'rsatamiz
                    if (option.className === "custom-typed-option") {
                      return true;
                    }

                    // Boshqa variantlar uchun qidiruv
                    return optionValue.includes(inputValue);
                  }}
                  tabIndex={8}
                  options={birthPlaceOptions}
                  onChange={(value, option) => {
                    // Select item tanlanganda doim tanlangan qiymatni yozamiz
                    const chosen = typeof value === 'string' ? value : '';
                    if (chosen) {
                      formManual.setFieldsValue({ birthPlace: chosen });
                      setBirthPlaceSearchRef(chosen);
                      setSearchValue(chosen);
                    }
                  }}
                  onClear={() => {
                    setBirthPlaceSearchRef("");
                    setSearchValue("");
                    formManual.setFieldsValue({ birthPlace: "" });
                  }}
                  onSelect={(value, option) => {
                    // Dropdown'dan tanlanganda keyingi input'ga o'tish
                    setTimeout(() => {
                      const nextInput = document.querySelector("[tabindex=\"9\"]");
                      if (nextInput) nextInput.focus();
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                      const activeOption = document.querySelector('.ant-select-item-option-active');

                      if (dropdownOpen && activeOption) {
                        // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                        // Antd o'zi tanlangan elementni o'rnatadi va keyingi input'ga o'tadi
                        return;
                      }

                      // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                      const typed = (e.target?.value ?? birthPlaceSearchRef.current ?? "").trim();
                      if (typed.length > 0) {
                        e.preventDefault();
                        formManual.setFieldsValue({ birthPlace: typed });
                        setBirthPlaceSearchRef(typed);
                        setSearchValue(typed);
                        const nextInput = document.querySelector("[tabindex=\"9\"]");
                        if (nextInput) nextInput.focus();
                      }
                    }
                  }}
                  // Qo'lda kiritish uchun:
                  onInputKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      const dropdownOpen = !!document.querySelector('.ant-select-dropdown');
                      const activeOption = document.querySelector('.ant-select-item-option-active');

                      if (dropdownOpen && activeOption) {
                        // Dropdown ochiq va aktiv element bo'lsa, uni tanlashga ruxsat beramiz
                        return;
                      }

                      // Dropdown ochiq emas yoki aktiv element yo'q bo'lsa, kiritilgan matnni saqlaymiz
                      const val = e.target?.value;
                      if (val) {
                        e.preventDefault();
                        formManual.setFieldsValue({ birthPlace: val });
                        setBirthPlaceSearchRef(val);
                        setSearchValue(val);
                        const next = document.querySelector('[tabindex="9"]');
                        setTimeout(() => next?.focus(), 0);
                      }
                    }
                  }}
                  onBlur={() => {
                    const typed = (birthPlaceSearchRef.current ?? "").trim();
                    // Focus yo'qolganida kiritilgan matnni saqlaymiz
                    if (typed.length > 0) {
                      setBirthPlaceSearchRef(typed);
                      setSearchValue(typed);
                    }
                  }}
                  onDropdownVisibleChange={(open) => {
                    if (!open) {
                      const typed = (birthPlaceSearchRef.current ?? "").trim();
                      // Dropdown yopilganida kiritilgan matnni saqlaymiz
                      if (typed.length > 0) {
                        setBirthPlaceSearchRef(typed);
                        setSearchValue(typed);
                      }
                    }
                  }}
                >
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("residence")}
                name="residence"
              // rules={[
              //   { required: true, message: t("please_enter_residence") },
              // ]}
              >
                <Input
                  placeholder={t("residence")}
                  tabIndex={9}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"10\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                name="workplace"
                label={t("workplace")}
                rules={[
                  { required: true, message: t("please_enter_workplace") },
                ]}
              >
                {/* <Select
                  className="w-100"
                  placeholder={t("workplace")}
                  showSearch
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  onChange={(value) => {
                    form.setFieldsValue({ workplace: value });
                  }}
                  onSearch={(searchText) => {
                    if (searchText.length === 0) {
                      fetchWorkplaces("").then((data) => {
                        setWorkplaceOptions(
                          data.map((item) => ({
                            value: item.name,
                            label: item.name,
                          }))
                        );
                      });
                    } else {
                      debouncedFetchWorkplaces(searchText);
                    }
                  }}
                  loading={workplaceFetching}
                  filterOption={false}
                  tabIndex={11}
                  options={workplaceOptions}
                  onSelect={() => {
                    setTimeout(() => {
                      const nextInput = document.querySelector("[tabindex=\"12\"]");
                      if (nextInput) nextInput.focus();
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"12\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                /> */}
                <Input
                  placeholder={t("workplace")}
                  tabIndex={10}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"11\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("record_list_manual")}
                name="recordNumber"
              >
                <Input
                  placeholder={t("record_list_manual")}
                  tabIndex={11}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"12\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("pinfl")}
                name="pinfl"
              // rules={[
              //   { required: true, message: t("please_enter_residence") },
              // ]}
              >
                <Input
                  placeholder={t("pinfl")}
                  tabIndex={12}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nextInput = document.querySelector("[tabindex=\"13\"]");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          {/* <Row gutter={[16, 16]}>
            <Col xs={24} sm={24} md={24} lg={24}>
              <Form.Item label={t("notes")} name="notes">
                <Input.TextArea
                  placeholder={t("notes")}
                  rows={4}
                  tabIndex={13}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      const saveButton = document.querySelector("[tabindex=\"14\"]");
                      if (saveButton) saveButton.focus();
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row> */}
        </Form>
      </Modal>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          // REMOVE: rowSelection={{
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
          gutter={[16, 16]}
        >
          <Col xs={24} sm={24} md={12} lg={12}>
            <span style={{ fontWeight: "bold" }}>
              {t("total_number_of_entries")}: {total}
            </span>
          </Col>
          <Col xs={24} sm={24} md={12} lg={12} style={{ textAlign: "right" }}>
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
                setSearch({ ...search, pageNumber: page, pageSize: pageSize });
                setPageSize(pageSize);
              }}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default Index;
