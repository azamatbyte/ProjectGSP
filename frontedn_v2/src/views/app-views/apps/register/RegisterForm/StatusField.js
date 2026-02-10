import React, { useState, useEffect } from "react";
import { Input, Row, Col, Card, Form, Checkbox, Select, DatePicker } from "antd";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import { useTranslation } from "react-i18next";
import debounce from "lodash/debounce";
import RegistrationService from "services/RegistrationService";
import { CompleteStatus } from "constants/CompleteStatus";
import AccessStatusService from "services/AccessStatusService";

const { Option } = Select;

const fetchAccessStatus = async (searchText) => {
	try {
		const response = await AccessStatusService.listWithStatus(
			1,
			25,
			searchText
		);
		return response?.data?.accessStatuses;
	} catch (error) {
		console.error("Xatolik:", error);
		return [];
	}
};

const StatusField = (props) => {
	const { t } = useTranslation();
	const { mode, id, model } = props;
	const [isReadOnly, setIsReadOnly] = useState(false);
	const [completeStatusValue, setCompleteStatusValue] = useState("WAITING");
	const [accessStatusOptions, setAccessStatusOptions] = useState([]);
	const [accessStatusFetching, setAccessStatusFetching] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			const accessStatuses = await fetchAccessStatus("");
			setAccessStatusOptions(
				accessStatuses.map((item) => ({
					value: item?.name,
					label: item?.name,
				}))
			);
		};
		fetchData();
	}, [model]);

	useEffect(() => {
		setIsReadOnly(props.isReadOnly);
	}, [props.isReadOnly]);

	const setConclusion = (value) => {
		if (
			value.target.checked &&
			props.form.getFieldValue("regNumber") &&
			props.form.getFieldValue("form_reg")
		) {
			const conclusionRegNum =
				props.form.getFieldValue("regNumber") +
				" ф-" +
				props.form.getFieldValue("form_reg");
			props.form.setFieldsValue({ conclusionRegNum: conclusionRegNum });
		} else {
			props.form.setFieldsValue({ conclusionRegNum: "" });
		}
	};

	const debouncedCheckRegNumber = debounce((value, resolve, reject) => {
		checkRegNumberInDB(value)
			.then((isValid) => {
				if (isValid) {
					resolve();
				} else {
					reject(t("reg_number_already_exists"));
				}
			})
			.catch(() => {
				reject(t("error_checking_reg_number"));
			});
	}, 500);

	const debouncedFetchAccessStatus = debounce(async (searchText) => {
		if (searchText.length >= 1) {
			setAccessStatusFetching(true);
			const data = await fetchAccessStatus(searchText);
			setAccessStatusOptions(
				data.map((item) => ({
					value: item.name,
					label: item.name,
				}))
			);
			setAccessStatusFetching(false);
		}
	}, 500);

	const checkRegNumberInDB = async (value) => {
		try {
			if (mode === "EDIT") {
				const response = await RegistrationService.checkRegNumber(value, id);
				if (response.status === 200) {
					return true;
				}
				return false;
			} else {
				const response = await RegistrationService.checkRegNumber(value);
				if (response.status === 200) {
					return true;
				}
				return false;
			}
		} catch (error) {
			console.error(t("error_checking_reg_number"), error);
			throw error;
		}
	};

	const rules = {
		regnumber: [
			{
				required: true,
				message: t("please_enter_the_registration_number"),
			},
			({ getFieldValue }) => ({
				validator(_, value) {
					if (!value) return Promise.resolve();
					return new Promise((resolve, reject) => {
						debouncedCheckRegNumber(value, resolve, reject);
					});
				},
				validateTrigger: ["onChange"],
			}),
		],
		completeStatus: [
			{
				// required: true,
				defaultValue: "WAITING",
				message: t("required_field"),
			},
		],
		error: [
			{
				required: true,
				message: t("required_field"),
			},
		],
	};
	return (
		<Card>
			<Col xs={24} sm={24} md={24}>
				<Row gutter={16}>
					<Col span={8}>
						<Form.Item label={t("status")}>
							<Checkbox.Group>
								<Row>
									<Col span={12}>
										<Checkbox
											onClick={(e) => setConclusion(e)}
											disabled={isReadOnly}
										>
											{t("conclusion")}
										</Checkbox>
									</Col>
								</Row>
							</Checkbox.Group>
						</Form.Item>
					</Col>
					<Col span={16}>
						<Form.Item
							name="conclusionRegNum"
							label={t("conclusion_number")}
						>
							<Input
								className="w-100"
								min={0}
								maxLength={255}
								tabIndex={12}
								disabled={isReadOnly}
							/>
						</Form.Item>
					</Col>
				</Row>
			</Col>
			<Col xs={24} sm={24} md={24}>
				<Form.Item
					name="regEndDate"
					label={t("reg_end_date")}
					placeholder={t("reg_end_date_placeholder")}
					disabled={isReadOnly}
				>
					<DatePicker
						format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
						className="w-100"
						onChange={() => {
							props.form.setFieldsValue({ completeStatus: "COMPLETED" });
							setCompleteStatusValue("COMPLETED");
						}}
						tabIndex={4}
						disabled={isReadOnly}
					/>
				</Form.Item>
			</Col>

			<Col xs={24} sm={24} md={24}>
				<Form.Item
					name="completeStatus"
					label={t("complete_status")}
					rules={rules.completeStatus}
				>
					<Select
						className="w-100"
						style={{ minWidth: 180 }}
						placeholder={t("select_a_form")}
						onChange={(value) => {
							setCompleteStatusValue(value);
							props.form.setFieldsValue({ completeStatus: value });
						}}
						tabIndex={1}
						defaultValue={"WAITING"}
						disabled={isReadOnly}
						maxLength={255}
						value={completeStatusValue}
					>
						{CompleteStatus.map((option) => (
							<Option key={option.value} value={option.value}>
								{option.label}
							</Option>
						))}
					</Select>
				</Form.Item>
			</Col>
			<Col xs={24} sm={24} md={24}>
				<Form.Item name="accessStatus" label={t("access_status")}>
					<Select
						className="w-100"
						placeholder={t("access_status")}
						showSearch
						style={{ width: 200, cursor: "pointer" }}
						optionFilterProp="children"
						onChange={(value) => {
							props.form.setFieldsValue({ accessStatus: value });
						}}
						defaultValue={"ПРОВЕРКА"}
						onSearch={(searchText) => {
							if (searchText.length === 0) {
								fetchAccessStatus("").then((data) => {
									setAccessStatusOptions(
										data.map((item) => ({
											value: item.name,
											label: item.name,
										}))
									);
								});
							} else {
								debouncedFetchAccessStatus(searchText);
							}
						}}
						loading={accessStatusFetching}
						filterOption={false}
						tabIndex={15}
						options={accessStatusOptions}
						disabled={isReadOnly}
					/>
				</Form.Item>
			</Col>
		</Card>
	);
};

export default StatusField;
