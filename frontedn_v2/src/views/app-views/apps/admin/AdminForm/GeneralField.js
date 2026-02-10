import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Select, DatePicker, Upload } from "antd";
import AuthService from "services/AuthService";
import { debounce } from "lodash";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT, DATE_FORMAT_DD_MM_YYYY_COMBINED } from "constants/DateConstant";
import Request from "utils/request";
import UploadService from "services/UploadService";
import { LoadingOutlined } from "@ant-design/icons";
import { message } from "antd";
import { ImageSvg } from "assets/svg/icon";
import CustomIcon from "components/util-components/CustomIcon";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
const { Option } = Select;

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
	const isJpgOrPng = file.type === "image/jpeg" || file.type === "image/png";
	if (!isJpgOrPng) {
		message.error(t("you_can_only_upload_jpg_png_file"));
	}
	const isLt2M = file.size / 1024 / 1024 < 2;
	if (!isLt2M) {
		message.error(t("image_must_smaller_than_2mb"));
	}
	return isJpgOrPng && isLt2M;
};

const GeneralField = (props) => {
	const { form, setImage: setImageProps, id, mode } = props;
	const [image, setImage] = useState(null);
	const [imageLoading, setImageLoading] = useState(false);
	const { t } = useTranslation();

	useEffect(() => {
		if (mode === "EDIT") {
			AuthService.getById(id).then((res) => {
				form.setFieldsValue(res.data);
			});
		}
	}, [mode, id, form]);

	const imageUploadProps = {
		name: "file",
		multiple: false,
		listType: "picture",
		showUploadList: false,
		uploadedImg: null,
		uploadLoading: false,
		customRequest: async ({ file, onSuccess, onError }) => {
			try {
				setImageLoading(true);
				const isUploaded = await handleUpload(file);
				if (isUploaded) {
					onSuccess(null, file);
					imageUploadProps.uploadedImg = isUploaded?.data?.link;
					imageUploadProps.uploadLoading = false;
					message.success(t("image_uploaded_successfully"));
					setImage(isUploaded?.data?.link);
					setImageProps(isUploaded?.data?.link);
				} else {
					onError(new Error(t("upload_failed")));
					imageUploadProps.uploadLoading = false;
				}
			} catch (error) {
				onError(error);
				imageUploadProps.uploadLoading = false;
			} finally {
				setImageLoading(false);
			}
		}
	};

	const handleChange = (value, key) => {
		if (key === "role") {
			form.setFieldsValue({ role: value === "admin" ? "admin" : "superAdmin" });
		} else if (key === "gender") {
			form.setFieldsValue({ gender: value === "male" ? "male" : "female" });
		}
	};

	const checkUsernameInDB = async (value, id) => {
		try {
			if (mode === "EDIT") {
				const res = await Request.getRequest(
					`auth/checkUsernameUpdate?username=${value}&&id=${id}`
				);
				if (res.status === 201) {
					return true;
				}
			} else {
				const res = await Request.getRequest(
					`auth/checkUsername?username=${value}`
				);
				if (res.status === 201) {
					return true;
				}
			}
			return false;
		} catch (error) {
			console.error("Username tekshirishda xatolik:", error);
			throw error;
		}
	};
	const debouncedCheckRegNumber = debounce((value, resolve, reject, id) => {
		checkUsernameInDB(value, id)
			.then((isValid) => {
				if (isValid) {
					resolve();
				} else {
					reject(t("username_already_exists"));
				}
			})
			.catch(() => {
				reject(t("error_checking_username"));
			});
	}, 100);

	const rules = {
		username: [
			{
				required: true,
				message: t("please_enter_username"),
			},
			({ getFieldValue }) => ({
				validator(_, value) {
					if (!value) return Promise.resolve();
					return new Promise((resolve, reject) => {
						debouncedCheckRegNumber(value, resolve, reject, id);
					});
				},
				validateTrigger: ["onChange"],
			}),
		],
		first_name: [
			{
				required: true,
				message: t("please_enter_first_name"),
			},
		],
		birthDate: [
			{
				required: true,
				message: t("please_select_birth_date"),
			},
			{
				type: "object",
				message: t("please_select_valid_date"),
			},
		],
	};

	const handleBirthDateKeyDown = (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			const inputValue = (event.target?.value || "").replace(/\D/g, "");
			if (inputValue.length === 8) {
				const parsed = dayjs.utc(inputValue, DATE_FORMAT_DD_MM_YYYY_COMBINED, true);
				if (parsed.isValid()) {
					form.setFieldsValue({ birthDate: parsed });
				} 
			}

			// Move focus to the next tabbable element in the same form
			const active = document.activeElement;
			const formEl = active && active.closest ? active.closest("form") : null;
			if (formEl) {
				const tabbables = Array.from(formEl.querySelectorAll("[tabindex]"))
					.filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"))
					.sort((a, b) => a.tabIndex - b.tabIndex);
				const currentTab = active && typeof active.tabIndex === "number" ? active.tabIndex : -1;
				const next = tabbables.find((el) => el.tabIndex > currentTab) || tabbables[0];
				if (next && typeof next.focus === "function") {
					next.focus();
				}
			}
		}
	};

	return (
		<>
			<Row gutter={16}>
				<Col xs={24} sm={24} md={17}>
					<Card title={t("basic_info")}>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="last_name" label={t("last_name")} required>
									<Input className="w-100" autoFocus tabIndex={1} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"1\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="first_name" label={t("first_name")} required>
									<Input className="w-100" maxLength={255} tabIndex={2} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"2\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="father_name" label={t("father_name")} required>
									<Input className="w-100" tabIndex={3} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"3\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="birthDate" label={t("birth_date")} required>
									<DatePicker
										format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
										className="w-100"
										tabIndex={4}
										onKeyDown={handleBirthDateKeyDown}
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="phone" label={t("phone")} required>
									<Input className="w-100" tabIndex={5} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"5\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="gender" label={t("gender")} initialValue="male">
									<Select
										placeholder={t("select_gender")}
										className="w-100"
										onChange={(value) => handleChange(value, "gender")}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												const nextInput = document.querySelector("[tabindex=\"7\"]");
												if (nextInput) nextInput.focus();
											}
										}}
										tabIndex={6}

									>
										<Option value="male">{t("male")}</Option>
										<Option value="female">{t("female")}</Option>
									</Select>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="role" label={t("role")} initialValue="admin">
									<Select
										placeholder={t("select_role")}
										className="w-100"
										onChange={(value) => handleChange(value, "role")}
										tabIndex={7}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												const nextInput = document.querySelector("[tabindex=\"8\"]");
												if (nextInput) nextInput.focus();
											}
										}}
									>
										<Option value="superAdmin">{t("super_admin")}</Option>
										<Option value="admin">{t("operator")}</Option>
									</Select>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="username"
									label={t("username_admin")}
									hasFeedback
									validateTrigger={["onChange"]}
									rules={rules.username}
								>
									<Input
										className="w-100"
										tabIndex={8}
										autoComplete="new-username"
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
								<Form.Item name="workplace" label={t("workplace")}>
									<Input className="w-100" tabIndex={10} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"11\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="rank" label={t("rank")}>
									<Input className="w-100" tabIndex={9} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"9\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>							
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="password" label={t("password")} required>
									<Input.Password tabIndex={11} autoComplete="new-password" maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"12\"]");
											if (nextInput) nextInput.focus();
										}
									}} />
								</Form.Item>
							</Col>
						</Row>
					</Card>
				</Col>
			</Row>
			<Row>
				<Col xs={24} sm={24} md={17}>
					<Card title={t("image")}
						tabIndex={11}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								document.querySelector("input[type='file']").click();
							}
						}}>
						<Row>
							<Col xs={24} sm={24} md={12}>
								<Upload
									{...imageUploadProps}
									beforeUpload={(file) => beforeUpload(file, t)}
								>
									{
										image ?
											<>
												<img src={image} alt="avatar" className="img-fluid" />
											</>
											:
											<div>
												{
													imageLoading ?
														<div>
															<LoadingOutlined className="font-size-xxl text-primary" />
															<div className="mt-3">Uploading</div>
														</div>
														:
														<div>
															<CustomIcon className="display-3" svg={ImageSvg} />
															<p>{t("click_or_drag_file_to_upload")}</p>
														</div>
												}
											</div>
									}
								</Upload>
							</Col>
						</Row>
					</Card>
				</Col>
			</Row>
		</>
	);
};

export default GeneralField;
